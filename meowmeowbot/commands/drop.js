const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require("discord.js");
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../meowmeowapi/.env") });
const { MongoClient } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGO_URI);

function parseDuration(str) {
  const match = str.match(/^(\d+)([hdmM])$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "h": return num * 3600;
    case "d": return num * 86400;
    case "m": return num * 60;
    case "M": return num * 2592000;
    default: return null;
  }
}

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1386755278959280260");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Schedule a drop for an item"),

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to drop items.",
        ephemeral: true,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("drop_non")
        .setLabel("Non-Limited")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("drop_limited")
        .setLabel("Limited")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("drop_unique")
        .setLabel("Unique")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      content: "🔻 Select the type of item you want to drop:",
      components: [row],
      ephemeral: true,
    });
  },

  async handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith("drop_")) {
      if (!userHasRole(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to interact.",
          ephemeral: true,
        });
      }

      const type = interaction.customId.split("_")[1];

      const modal = new ModalBuilder()
        .setCustomId(`modal_${type}`)
        .setTitle(`Create ${type.charAt(0).toUpperCase() + type.slice(1)} Item`)
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId("itemId")
            .setLabel("Item ID (numeric)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Item Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Description")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId("price")
            .setLabel("Original Price")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId("qtyDuration")
            .setLabel("Quantity and Duration (e.g. '10 1h')")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("10 1h")
            .setRequired(true))
        );

      return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_")) {
      if (!userHasRole(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to submit this form.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const type = interaction.customId.split("_")[1];
      const itemId = parseInt(interaction.fields.getTextInputValue("itemId"));
      const name = interaction.fields.getTextInputValue("name");
      const description = interaction.fields.getTextInputValue("description");
      const price = parseInt(interaction.fields.getTextInputValue("price"));
      const [quantityStr, durationRaw] = interaction.fields
        .getTextInputValue("qtyDuration")
        .trim()
        .split(/\s+/);

      const quantity = parseInt(quantityStr);
      const duration = parseDuration(durationRaw);

      if ([itemId, price, quantity].some(v => isNaN(v) || v <= 0) || !duration) {
        return interaction.editReply({
          content: "❌ Invalid input. Please make sure all fields are correct (e.g. '10 1h')",
          ephemeral: true,
        });
      }

      const releaseTime = Math.floor(Date.now() / 1000);
      const offsaleTime = releaseTime + duration;

      const newItem = {
        itemId,
        name,
        creator: interaction.user.username,
        description,
        type: type === "non" ? "nonlimited" : type,
        originalPrice: price,
        rap: price,
        value: 0,
        quantitySold: 0,
        totalQuantity: type === "unique" ? quantity : 0,
        offsaleTime: type === "limited" ? offsaleTime : 0,
        releaseTime,
        projected: false,
        tradeable: true,
        reselling: [],
        history: [],
        serials: [],
      };

      try {
        await mongoClient.connect();
        const db = mongoClient.db("ArcadeHaven");
        await db.collection("items").insertOne(newItem);

        let thumbnailUrl;
        try {
          const thumbRes = await axios.get(
            `https://thumbnails.roproxy.com/v1/assets?assetIds=${itemId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
          );
          thumbnailUrl = thumbRes.data?.data?.[0]?.imageUrl || null;
        } catch (err) {
          console.warn("⚠️ Thumbnail fetch failed:", err.message);
        }

        const embed = {
          content: null,
          embeds: [
            {
              title: `🎉 New Item Created: ${name}`,
              description,
              color: 0x45dd3c,
              fields: [
                { name: "Item ID", value: `${itemId}`, inline: true },
                { name: "Price", value: `${price}`, inline: true },
                { name: "Creator", value: interaction.user.username, inline: true },
                { name: "Quantity", value: `${quantity}`, inline: true },
                { name: "Duration", value: durationRaw, inline: true },
              ],
              thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
              timestamp: new Date().toISOString(),
            },
          ],
        };

        try {
          await axios.post("http://127.0.0.1:3003", {
            channel_id: "1395779865696796693",
            msg: embed,
          });
        } catch (err) {
          console.error("❌ Failed to send embed:", err.message);
        }

        await interaction.editReply({
          content: `✅ Created item **${name}** (ID: ${itemId}) — ${type} with ${quantity} stock, lasting ${durationRaw}.`,
          ephemeral: true,
        });
      } catch (err) {
        console.error("❌ DB error:", err);
        await interaction.editReply({
          content: "❌ Failed to save item to the database.",
          ephemeral: true,
        });
      } finally {
        await mongoClient.close();
      }
    }
  },
};
