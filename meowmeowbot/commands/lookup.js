const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
} = require("discord.js");
const { getIdFromUsername, getPlayerThumbnail } = require("noblox.js");
const axios = require("axios");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../meowmeowapi/.env"),
});

const UNIVERSE_ID = "7951799810";
const OPEN_CLOUD_TOKEN = process.env.DATASTORE_KEY;
const DATASTORE_NAME = "DATA_2";

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1397899730943479930");
}

// async function publishRobloxMessage(user) {
//   const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}:publishMessage`;

//   const data = {
//     topic: "kickplayer",
//     message: user, // userid
//   };

//   try {
//     const response = await axios.post(url, data, {
//       headers: {
//         "x-api-key": OPEN_CLOUD_TOKEN,
//         "Content-Type": "application/json",
//       },
//     });
//     console.log("Message published:", response.data);
//   } catch (error) {
//     console.error("Failed to publish message:", error.response?.data || error.message);
//   }
// }

function formatNumber(num) {
  if (typeof num !== "number") return num;
  return num.toLocaleString();
}

async function getPlayerData(userId) {
  const entryId = `MAIN_${userId}`;
  const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/data-stores/${encodeURIComponent(
    DATASTORE_NAME
  )}/entries/${encodeURIComponent(entryId)}`;

  const res = await axios.get(url, {
    headers: {
      "x-api-key": OPEN_CLOUD_TOKEN,
    },
  });

  return res.data;
}

async function updatePlayerData(
  userId,
  newValue,
  etag = "",
  users = [],
  attributes = {}
) {
  const entryId = `MAIN_${userId}`;
  const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/data-stores/${encodeURIComponent(
    DATASTORE_NAME
  )}/entries/${encodeURIComponent(entryId)}?allowMissing=true`;

  const payload = {
    etag,
    value: newValue,
    users,
    attributes,
  };

  const res = await axios.patch(url, payload, {
    headers: {
      "x-api-key": OPEN_CLOUD_TOKEN,
      "Content-Type": "application/json",
    },
  });

  return res.data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Lookup user player data")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("Roblox username or UserId")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }
    const input = interaction.options.getString("user");
    await interaction.deferReply({ ephemeral: true });

    try {
      let userId = input;
      if (!/^\d+$/.test(input)) {
        try {
          userId = await getIdFromUsername(input);
        } catch {
          return interaction.editReply({
            content: `❌ Roblox user "${input}" not found.`,
          });
        }
      }

      const thumbnailData = await getPlayerThumbnail(
        userId,
        150,
        "png",
        false,
        "headshot"
      );
      const avatarUrl = thumbnailData[0]?.imageUrl || null;

      let playerData;
      try {
        playerData = await getPlayerData(userId);
      } catch (err) {
        if (err.response?.status === 404) {
          return interaction.editReply({
            content: `❌ No data found for user \`${userId}\` in \`DATA_1\`.`,
          });
        }
        console.error("DataStore fetch error:", err);
        return interaction.editReply({
          content: "❌ Error fetching player data.",
        });
      }

      const data = playerData?.value.Data ?? {};
      let warning = "";
      if (playerData?.value?.MetaData?.ActiveSession) {
        warning = "**⚠️ USER IS CURRENTLY IN-GAME ⚠️**";
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 Player Data for ${input}`)
        .setColor(0x7289da)
        .setTimestamp()
        .setDescription(
          `${warning}${
            warning ? "\n\n" : ""
          }Showing data from userid \`${userId}\` :`
        );

      if (avatarUrl) {
        embed.setThumbnail(avatarUrl);
      }

      const fieldsToShow = ["Cash", "Value", "RAP", "Wagered", "Level"];
      for (const key of fieldsToShow) {
        const value = data[key];
        if (value !== undefined) {
          let displayValue =
            key === "Cash" ||
            key === "Wagered" ||
            key === "Value" ||
            key === "RAP"
              ? `$${formatNumber(value)}`
              : formatNumber(value);

          embed.addFields({
            name: key,
            value: String(displayValue),
            inline: true,
          });
        }
      }

      const actionRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`action_select_${userId}`)
          .setPlaceholder("Choose an action")
          .addOptions([
            { label: "Add Cash", value: "add_cash" },
            { label: "Remove Cash", value: "remove_cash" },
            { label: "Set Cash", value: "set_cash" },
            { label: "Ban", value: "ban" },
            { label: "Unban", value: "unban" },
            { label: "Transfer", value: "transfer" },
            { label: "Wipe Data", value: "wipe" },
          ])
      );

      await interaction.editReply({ embeds: [embed], components: [actionRow] });
    } catch (error) {
      console.error("Lookup command error:", error);
      await interaction.editReply({
        content: "❌ An unexpected error occurred.",
      });
    }
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu()) {
      const userId = interaction.customId.replace("action_select_", "");
      const selected = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`modal_${selected}_${userId}`)
        .setTitle(`Action: ${selected.replace("_", " ")}`);

      let inputLabel = "Enter value:";
      let placeholder = "";
      let required = true;

      if (selected.includes("cash")) {
        inputLabel = "Enter cash amount:";
        placeholder = "e.g. 1000";
      } else if (selected === "ban") {
        inputLabel =
          "Reason | Duration (s, m, h, d):";
        placeholder = "Exploiting | 7d)";
      }

      const input = new TextInputBuilder()
        .setCustomId("lookup_input")
        .setLabel(inputLabel)
        .setStyle(TextInputStyle.Short)
        .setRequired(required)
        .setPlaceholder(placeholder);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    } else if (interaction.type === InteractionType.ModalSubmit) {
      const modalIdParts = interaction.customId.split("_");
      if (modalIdParts.length < 3) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: "❌ Invalid modal interaction.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Invalid modal interaction.",
            ephemeral: true,
          });
        }
        return;
      }

      const userId = modalIdParts.pop();
      const action = modalIdParts.slice(1).join("_");
      const input = interaction.fields.getTextInputValue("lookup_input");

      let playerData;
      try {
        playerData = await getPlayerData(userId);
      } catch (err) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: "❌ Failed to fetch current data.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Failed to fetch current data.",
            ephemeral: true,
          });
        }
        return;
      }

      let current = playerData?.value?.Data || {};
      const etag = playerData?.etag || "";

      let value = parseInt(input);
      if (isNaN(value) && action !== "ban" && action !== "transfer") {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: "❌ Invalid number input.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Invalid number input.",
            ephemeral: true,
          });
        }
        return;
      }

      // If ActiveSession exists, delete it
      if (playerData?.value?.MetaData?.ActiveSession) {
        delete playerData.value.MetaData.ActiveSession;
      }

      switch (action) {
        case "add_cash":
          current.Cash = (current.Cash || 0) + value;
          break;
        case "remove_cash":
          current.Cash = (current.Cash || 0) - value;
          break;
        case "set_cash":
          current.Cash = value;
          break;
        case "ban":
          const [reasonRaw, durationRaw] = input.split("|").map(s => s.trim());
          current.Moderation.BanData1.Reason = reasonRaw;
          current.Moderation.BanData1.Banned = true;

          // Optional duration handling
          if (durationRaw) {
            const match = durationRaw.match(/^(\d+)([smhd])$/); // s/m/h/d
            if (match) {
              const [_, amount, unit] = match;
              const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
              const durationMs = parseInt(amount) * multiplier;
              current.Moderation.BanData1.ExpiresAt = Date.now() + durationMs;
            }
          }
          break;
        case "unban":
          if (!current.Moderation) current.Moderation = {};
          if (!current.Moderation.BanData1) current.Moderation.BanData1 = {};
          current.Moderation.BanData1.Banned = false;
          break;
        default:
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
              content: "❌ Unknown action.",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "❌ Unknown action.",
              ephemeral: true,
            });
          }
          return;
      }

      // Use the entire existing playerData.value, but replace .Data
      const newValue = { ...playerData.value, Data: current };

      try {
        await updatePlayerData(userId, newValue, etag);

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `✅ Success.`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `✅ Success.`,
            ephemeral: true,
          });
        }
      } catch (err) {
        console.error("Update failed:", err);

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: "❌ Failed to update data.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Failed to update data.",
            ephemeral: true,
          });
        }
      }
    }
  },
};