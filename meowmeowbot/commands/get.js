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
const { MongoClient } = require("mongodb");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let itemsCollection;

const REQUEST_CHANNEL_ID = "1397880168575664186"; // Set your mod channel ID here

// Setup ChartJS canvas
const width = 800;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

async function getItemsCollection() {
  if (!itemsCollection) {
    await mongoClient.connect();
    const db = mongoClient.db("ArcadeHaven");
    itemsCollection = db.collection("items");
  }
  return itemsCollection;
}

function formatNumberWithCommas(number) {
  if (typeof number !== "number") return number;
  return number.toLocaleString("en-US");
}

function userHasRole(interaction) {
  const allowedRoles = ["1397880167099273332", "1397899730943479930"];
  return interaction.member?.roles.cache.some((role) =>
    allowedRoles.includes(role.id)
  );
}

function userHasValueRole(member) {
  const modRoles = ["1386503577186471976"]; // Adjust to your mod role IDs
  return member.roles.cache.some((role) => modRoles.includes(role.id));
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000); // Unix seconds to ms
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

async function generateRapHistoryGraph(rapHistory) {
  const rapValues = rapHistory.map((entry) => entry[0]);
  const timestamps = rapHistory.map((entry) => entry[1]);
  const labels = timestamps.map(formatDate);

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "RAP History",
          data: rapValues,
          borderColor: "#ff00ff",
          backgroundColor: "rgba(255, 0, 255, 0.2)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      scales: {
        x: { title: { display: true, text: "Date" } },
        y: { title: { display: true, text: "RAP Value" }, beginAtZero: false },
      },
      plugins: {
        legend: { display: true, position: "top" },
      },
    },
  };

  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("get")
    .setDescription("Get an item's info by name or ID.")
    .addIntegerOption((option) =>
      option
        .setName("itemid")
        .setDescription("The item's ID")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The item's name")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }

    const itemId = interaction.options.getInteger("itemid");
    const name = interaction.options.getString("name");

    if (!itemId && (!name || name.trim() === "")) {
      return interaction.reply({
        content: "❌ You must provide either an item ID or name.",
        ephemeral: true,
      });
    }

    const items = await getItemsCollection();

    let item;
    if (itemId) {
      item = await items.findOne({ itemId });
    } else {
      // Escape any RegExp special characters in the name (e.g., $)
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      item = await items.findOne({
        name: { $regex: `^${escapedName}$`, $options: "i" },
      });
    }

    if (!item) {
      return interaction.reply({
        content: "❌ Item not found.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📦 ${item.name}`)
      .setDescription(item.description || "No description.")
      .addFields(
      { name: "Item ID", value: `\`${(item.itemId)}\``, inline: true },
      {
        name: "Price",
        value: `R$${item.originalPrice != null ? formatNumberWithCommas(item.originalPrice) : "???"}`,
        inline: true,
      },
      {
        name: "Quantity",
        value: item.totalQuantity != null ? formatNumberWithCommas(item.totalQuantity) : "???",
        inline: true,
      },
      {
        name: "RAP",
        value: `R$${item.rap != null ? formatNumberWithCommas(Math.round(item.rap)) : "???"}`,
        inline: true,
      },
      {
        name: "Value",
        value: `R$${item.value != null ? formatNumberWithCommas(item.value) : "???"}`,
        inline: true,
      },
      { name: "Type", value: `${item.type ?? "unknown"}`, inline: true }
      )
      .setColor(0xff00ff);

    if (
      item.history &&
      Array.isArray(item.history) &&
      item.history.length > 1
    ) {
      try {
        const imageBuffer = await generateRapHistoryGraph(item.history);
        embed.setImage("attachment://raphistory.png");

        // Add "Request Value" button
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`requestvalue_${item.itemId}`)
            .setLabel("Request Value")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          embeds: [embed],
          files: [{ attachment: imageBuffer, name: "raphistory.png" }],
          components: [buttonRow],
          ephemeral: true,
        });
      } catch (err) {
        console.error("❌ Error generating RAP graph:", err);
        // fallback to just embed + button
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`requestvalue_${item.itemId}`)
            .setLabel("Request Value")
            .setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({
          embeds: [embed],
          components: [buttonRow],
          ephemeral: true,
        });
      }
    } else {
      // No history, just embed + button
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`requestvalue_${item.itemId}`)
          .setLabel("Request Value")
          .setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({
        embeds: [embed],
        components: [buttonRow],
        ephemeral: true,
      });
    }
  },

  async handleInteraction(interaction) {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const items = await getItemsCollection();

      const matches = await items
        .find({ name: { $regex: new RegExp(focused, "i") } })
        .limit(10)
        .toArray();

      const suggestions = matches.map((item) => ({
        name: `${item.name} (ID: ${item.itemId})`,
        value: item.name,
      }));

      await interaction.respond(suggestions);
      return;
    }

    // Handle button click for "Request Value"
    if (interaction.isButton()) {
      const [prefix, itemId] = interaction.customId.split("_");
      if (prefix === "requestvalue") {
        if (!userHasValueRole(interaction.member)) {
          return interaction.reply({
            content: "❌ You don't have permission to request a value change.",
            ephemeral: true,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`valueRequestModal_${itemId}_${interaction.user.id}`)
          .setTitle(`Request Value for Item ${itemId}`);

        const valueInput = new TextInputBuilder()
          .setCustomId("requestedValue")
          .setLabel("Enter new value")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter a number greater than 0")
          .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(valueInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        return;
      }
    }

    // Handle modal submit for value request
    if (interaction.isModalSubmit()) {
  const [prefix, itemId, requesterId] = interaction.customId.split("_");
  if (prefix === "valueRequestModal") {
    if (interaction.user.id !== requesterId) {
      return interaction.reply({
        content: "This modal isn't for you!",
        ephemeral: true,
      });
    }

    const requestedValueStr = interaction.fields.getTextInputValue("requestedValue");
    const requestedValue = parseInt(requestedValueStr);

    if (isNaN(requestedValue) || requestedValue <= 0) {
      return interaction.reply({
        content: "Invalid value entered.",
        ephemeral: true,
      });
    }

    // Generate unique request ID
    const requestId = uuidv4();

    // DB and item lookup
    const db = mongoClient.db("ArcadeHaven");
    const requestsCol = db.collection("valueRequests");
    const items = await getItemsCollection();

    const item = await items.findOne({ itemId: parseInt(itemId) });
    if (!item) {
      return interaction.reply({
        content: "Item not found.",
        ephemeral: true,
      });
    }

    // Fetch mod channel
    const modChannel = await interaction.client.channels.fetch(REQUEST_CHANNEL_ID);
    if (!modChannel) {
      return interaction.reply({
        content: "Mod channel not found. Contact admin.",
        ephemeral: true,
      });
    }

    // Create and send embed
    const requestEmbed = new EmbedBuilder()
      .setTitle(`Value Change Request`)
      .addFields(
        { name: "Item", value: `${item.name} (ID: ${item.itemId})`, inline: true },
        { name: "Requested Value", value: `R$${formatNumberWithCommas(requestedValue)}`, inline: true },
        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Request ID", value: `\`${requestId}\``, inline: false }
      )
      .setColor(0xffa500)
      .setTimestamp();

    const sentMessage = await modChannel.send({ embeds: [requestEmbed] });

    // Save request to DB including message info
    const requestDoc = {
      requestId,
      itemId: item.itemId,
      itemName: item.name,
      requestedValue,
      requesterId: interaction.user.id,
      status: "pending",
      createdAt: new Date(),
      modChannelId: sentMessage.channel.id,
      modMessageId: sentMessage.id,
    };

    await requestsCol.insertOne(requestDoc);

    return interaction.reply({
      content: `✅ Your request has been submitted with ID \`${requestId}\`.`,
      ephemeral: true,
    });
  }
}
  },
};
