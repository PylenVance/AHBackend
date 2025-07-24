const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const axios = require("axios");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let requestsCollection;

async function getRequestsCollection() {
  if (!requestsCollection) {
    await mongoClient.connect();
    const db = mongoClient.db("ArcadeHaven");
    requestsCollection = db.collection("valueRequests");
  }
  return requestsCollection;
}

function formatNumber(num) {
  if (typeof num !== "number") return num;
  return num.toLocaleString();
}

function userCanReview(interaction) {
  const reviewerRoleId = "1388153642124705822"; // Replace with your reviewer role ID
  return interaction.member?.roles.cache.has(reviewerRoleId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("viewrequest")
    .setDescription("View and review a value request by its ID.")
    .addStringOption((option) =>
      option
        .setName("requestid")
        .setDescription("The unique ID of the value request")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!userCanReview(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to review value requests.",
        ephemeral: true,
      });
    }

    const requestId = interaction.options.getString("requestid");
    const requests = await getRequestsCollection();

    const request = await requests.findOne({ requestId });

    if (!request) {
      return interaction.reply({
        content: `❌ No request found with ID \`${requestId}\`.`,
        ephemeral: true,
      });
    }

    if (request.status && request.status !== "pending") {
      return interaction.reply({
        content: `⚠️ This request has already been ${request.status}.`,
        ephemeral: true,
      });
    }

    const requesterId = request.requesterId || request.requestedBy || "Unknown";

    const embed = new EmbedBuilder()
      .setTitle(`Value Request: ${request.itemName} (ID: ${request.itemId})`)
      .setDescription(request.reason || "No reason provided.")
      .addFields(
        { name: "Requested By", value: `<@${requesterId}>`, inline: true },
        {
          name: "Requested Value",
          value: `R$${formatNumber(request.requestedValue)}`,
          inline: true,
        },
        { name: "Request ID", value: requestId, inline: false }
      )
      .setColor(0xffa500)
      .setTimestamp(request.createdAt || new Date());

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${requestId}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${requestId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },

  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    const [action, requestId] = interaction.customId.split("_");
    if (!["accept", "deny"].includes(action)) return;

    if (!userCanReview(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to review requests.",
        ephemeral: true,
      });
    }

    const requests = await getRequestsCollection();
    const request = await requests.findOne({ requestId });

    if (!request) {
      return interaction.reply({
        content: "❌ Request not found or already handled.",
        ephemeral: true,
      });
    }

    if (request.status && request.status !== "pending") {
      return interaction.reply({
        content: `⚠️ Request already ${request.status}.`,
        ephemeral: true,
      });
    }

    const newStatus = action === "accept" ? "accepted" : "denied";

    if (action === "accept") {
      // Update item value
      const db = mongoClient.db("ArcadeHaven");
      const items = db.collection("items");
      const item = await items.findOne({ itemId: request.itemId });

      if (!item) {
        return interaction.reply({
          content: "❌ Item not found.",
          ephemeral: true,
        });
      }

      const oldValue = item.value ?? 0;
      const newValue = request.requestedValue;
      await items.updateOne(
        { itemId: request.itemId },
        { $set: { value: newValue } }
      );

      const diff = newValue - oldValue;
      const percentChange = ((diff / (oldValue || 1)) * 100).toFixed(2);
      const isIncrease = diff >= 0;

      let thumbnailUrl = null;
      try {
        const thumbRes = await axios.get(
          `https://thumbnails.roproxy.com/v1/assets?assetIds=${request.itemId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
        );
        thumbnailUrl = thumbRes.data?.data?.[0]?.imageUrl ?? null;
      } catch (e) {
        console.warn("⚠️ Could not get thumbnail:", e.message);
      }

      const embed = {
        embeds: [
          {
            title: `💰 Item Value ${isIncrease ? "Increased" : "Decreased"}`,
            description: `**${item.name}** (ID: \`${request.itemId}\`) had its value updated.`,
            color: isIncrease ? 0x1bff3f : 0xff1b1b,
            fields: [
              { name: "Old Value", value: `R$${formatNumber(oldValue)}`, inline: true },
              { name: "New Value", value: `R$${formatNumber(newValue)}`, inline: true },
              {
                name: "Change",
                value: `${isIncrease ? "+" : "-"}R$${formatNumber(Math.abs(
                  diff
                ))} (${formatNumber(percentChange)}%)`,
                inline: true,
              },
            ],
            thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      try {
        await axios.post("http://127.0.0.1:3003", {
          channel_id: "1395779900748857365",
          msg: embed,
        });
      } catch (err) {
        console.error("❌ Failed to send value update embed:", err.message);
      }
    }

    // Update DB
    await requests.updateOne(
      { requestId },
      {
        $set: {
          status: newStatus,
          reviewedBy: interaction.user.id,
          reviewedAt: new Date(),
        },
      }
    );

    // Try to delete the old message and send a new one
    if (request.modChannelId && request.modMessageId) {
      try {
        const channel = await interaction.client.channels.fetch(
          request.modChannelId
        );
        const oldMessage = await channel.messages.fetch(request.modMessageId);
        await oldMessage.delete();

        const resultEmbed = new EmbedBuilder()
          .setTitle(`📋 Value Request ${newStatus.toUpperCase()}`)
          .setDescription(
            `Request for item **${request.itemName}** has been **${newStatus}**.`
          )
          .addFields(
            {
              name: "Requested Value",
              value: `R$${formatNumber(request.requestedValue)}`,
              inline: true,
            },
            {
              name: "Reviewed By",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            {
              name: "Requested By",
              value: `<@${request.requesterId}>`,
              inline: true,
            },
            { name: "Request ID", value: `\`${requestId}\`` }
          )
          .setColor(newStatus === "accepted" ? 0x1bff3f : 0xff1b1b)
          .setTimestamp();

        await channel.send({ embeds: [resultEmbed] });
      } catch (err) {
        console.warn("⚠️ Failed to delete or replace message:", err.message);
      }
    }

    // Final interaction reply
    await interaction.update({
      content: `✅ Request **${newStatus}** by <@${interaction.user.id}>.`,
      embeds: [],
      components: [],
    });
  },
};
