const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../meowmeowapi/.env") });

const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGO_URI);
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

let dbConnected = false;
async function connectDb() {
  if (!dbConnected) {
    await client.connect();
    dbConnected = true;
  }
}

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1386755278959280260");
}

// Helper to format duration string for queue, e.g. 3600 -> "1h"
function formatDuration(seconds) {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([hdmM])?$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "h": return num * 3600;
    case "d": return num * 86400;
    case "m": return num * 60;
    case "M": return num * 2592000;
    default: return num;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("randomitem")
    .setDescription("Get a random Rolimons item."),

  // Slash command handler
  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const res = await axios.get("https://www.rolimons.com/itemapi/itemdetails");
      const items = res.data.items;
      const itemIds = Object.keys(items);

      let randomItem = null;

      await connectDb();
      const db = client.db("ArcadeHaven");
      const itemsCollection = db.collection("items");

      for (let i = 0; i < 20; i++) {
        const id = itemIds[Math.floor(Math.random() * itemIds.length)];
        const data = items[id];
        if (data && data[2] > 0) {
          const itemId = parseInt(id, 10);
          const found = await itemsCollection.findOne({ itemId });
          if (!found) {
            randomItem = { id, data };
            break;
          }
        }
      }

      if (!randomItem) {
        return interaction.editReply("❌ Couldn't find a valid item that doesn't already exist.");
      }

      const [name, , rap, , value] = randomItem.data;
      const itemId = parseInt(randomItem.id, 10);

      let thumbUrl = `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`;
      try {
        const thumbRes = await axios.get(
          `https://thumbnails.roproxy.com/v1/assets?assetIds=${itemId}&size=420x420&format=Png&isCircular=false`
        );
        const imageData = thumbRes.data?.data?.[0];
        if (imageData?.imageUrl && !imageData.imageUrl.includes("nothumbnail")) {
          thumbUrl = imageData.imageUrl;
        }
      } catch (e) {
        console.warn("Couldn't fetch proxy thumbnail:", e.message);
      }

      let description = "No description available.";
      try {
        const descRes = await axios.get(
          `https://economy.roblox.com/v2/assets/${itemId}/details`,
          {
            headers: {
              Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
            },
          }
        );
        if (descRes.data?.Description) {
          description = descRes.data.Description;
        }
      } catch (e) {
        console.warn("Couldn't fetch Roblox item description:", e.message);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎲 Random Item: ${name}`)
        .setDescription(
          `**RAP:** ${rap.toLocaleString()} R$\n` +
          `**Value:** ${value > 0 ? `${value.toLocaleString()} R$` : "Unvalued"}\n\n` +
          `**Description:**\n${description}`
        )
        .setColor(0x7289da)
        .setThumbnail(thumbUrl)
        .addFields([{ name: "Item ID", value: `\`${itemId}\``, inline: true }])
        .setTimestamp();

      const queueButton = new ButtonBuilder()
        .setCustomId(`queue_item_${itemId}`)
        .setLabel("Queue this item")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(queueButton);

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error("❌ Rolimons API Error:", err);
      await interaction.editReply("❌ Failed to fetch item info.");
    }
  },

  // Button + Modal handler
  async handleInteraction(interaction) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith("queue_item_")) return;

      if (!userHasRole(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to queue items.",
          ephemeral: true,
        });
      }

      // await interaction.deferUpdate();

      const itemId = interaction.customId.replace("queue_item_", "");

      const modal = new ModalBuilder()
        .setCustomId(`queue_modal_${itemId}`)
        .setTitle(`Queue Item ${itemId}`);

      const priceInput = new TextInputBuilder()
        .setCustomId("price")
        .setLabel("Price (R$)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 1000")
        .setRequired(true);

      const quantityInput = new TextInputBuilder()
        .setCustomId("quantity")
        .setLabel("Quantity")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 1")
        .setRequired(true);

      const durationInput = new TextInputBuilder()
        .setCustomId("duration")
        .setLabel("Duration (e.g. '1h', '30m', '0' for unique)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1h")
        .setRequired(true);

      const typeInput = new TextInputBuilder()
        .setCustomId("type")
        .setLabel("Type (nonlimited, limited, unique)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("nonlimited")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(priceInput),
        new ActionRowBuilder().addComponents(quantityInput),
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(typeInput)
      );

      await interaction.showModal(modal);
    }
    else if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith("queue_modal_")) return;

      if (!userHasRole(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to queue items.",
          ephemeral: true,
        });
      }

      await connectDb();
      const db = client.db("ArcadeHaven");
      const dropCollection = db.collection("dropQueue");

      const itemId = parseInt(interaction.customId.replace("queue_modal_", ""), 10);

      const price = parseInt(interaction.fields.getTextInputValue("price"), 10);
      const quantity = parseInt(interaction.fields.getTextInputValue("quantity"), 10);
      const durationStr = interaction.fields.getTextInputValue("duration");
      const type = interaction.fields.getTextInputValue("type").toLowerCase();

      const duration = parseDuration(durationStr);

      if (
        isNaN(price) || price <= 0 ||
        isNaN(quantity) || quantity <= 0 ||
        duration === null || duration < 0 ||
        !["nonlimited", "limited", "unique"].includes(type)
      ) {
        return interaction.reply({
          content: "❌ Invalid inputs! Make sure all fields are correct.",
          ephemeral: true,
        });
      }

      const delay = 900; // 15 minutes
      const now = Math.floor(Date.now() / 1000);
      const lastDrop = await dropCollection.find().sort({ scheduledAt: -1 }).limit(1).toArray();
      const lastTime = lastDrop.length > 0 ? lastDrop[0].scheduledAt : now;
      const scheduledAt = Math.max(lastTime, now) + delay;
      const offsaleTime = (type === "limited" || type === "nonlimited") ? scheduledAt + duration : 0;

      // Fetch name and description for confirmation (optional)
      let name = `Item ${itemId}`;
      let description = "No description available.";
      try {
        const descRes = await axios.get(
          `https://economy.roblox.com/v2/assets/${itemId}/details`,
          { headers: { Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}` } }
        );
        if (descRes.data?.Name) name = descRes.data.Name;
        if (descRes.data?.Description) description = descRes.data.Description;
      } catch {
        // ignore errors
      }

      const drop = {
        itemId,
        name,
        description,
        price,
        quantity,
        duration,
        scheduledAt,
        offsaleTime,
        addedBy: interaction.user.id,
        addedAt: Date.now(),
        done: false,
        type,
      };

      await dropCollection.insertOne(drop);

      await interaction.reply({
        content: `✅ Scheduled drop for **${name}** at <t:${scheduledAt}:F>`,
        ephemeral: true,
      });
    }
  },
};
