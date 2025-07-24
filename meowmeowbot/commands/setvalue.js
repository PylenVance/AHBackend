// const { SlashCommandBuilder } = require("discord.js");
// const axios = require("axios");
// const { MongoClient } = require("mongodb");

// const mongoUri = process.env.MONGO_URI;
// const mongoClient = new MongoClient(mongoUri);

// function userHasRole(interaction) {
//   return interaction.member?.roles.cache.has("1386755278959280260"); // your role ID
// }

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName("setvalue")
//     .setDescription("Change the value of an item.")
//     .addStringOption(option =>
//       option
//         .setName("item")
//         .setDescription("Search for the item")
//         .setRequired(true)
//         .setAutocomplete(true)
//     )
//     .addIntegerOption(option =>
//       option
//         .setName("value")
//         .setDescription("New value for the item")
//         .setRequired(true)
//     ),

//   async execute(interaction) {
//     if (!userHasRole(interaction)) {
//       return interaction.reply({
//         content: "❌ You don't have permission to use this command.",
//         ephemeral: true,
//       });
//     }

//     const itemId = parseInt(interaction.options.getString("item"));
//     const newValue = interaction.options.getInteger("value");

//     if (isNaN(itemId) || newValue <= 0) {
//       return interaction.reply({
//         content: "❌ Invalid item ID or value.",
//         ephemeral: true,
//       });
//     }

//     try {
//       await mongoClient.connect();
//       const db = mongoClient.db("ArcadeHaven");
//       const items = db.collection("items");

//       const existing = await items.findOne({ itemId });
//       if (!existing) {
//         return interaction.reply({
//           content: "❌ Item not found.",
//           ephemeral: true,
//         });
//       }

//       const oldValue = existing.value ?? 0;
//       await items.updateOne({ itemId }, { $set: { value: newValue } });

//       const diff = newValue - oldValue;
//       const percentChange = ((diff / (oldValue || 1)) * 100).toFixed(2);
//       const isIncrease = diff >= 0;

//       let thumbnailUrl = null;
//       try {
//         const thumbRes = await axios.get(
//           `https://thumbnails.roproxy.com/v1/assets?assetIds=${itemId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
//         );
//         thumbnailUrl = thumbRes.data?.data?.[0]?.imageUrl ?? null;
//       } catch (e) {
//         console.warn("⚠️ Could not get thumbnail:", e.message);
//       }

//       const embed = {
//         embeds: [
//           {
//             title: `💰 Item Value ${isIncrease ? "Increased" : "Decreased"}`,
//             description: `**${existing.name}** (ID: \`${itemId}\`) had its value updated.`,
//             color: isIncrease ? 0x1bff3f : 0xff1b1b,
//             fields: [
//               { name: "Old Value", value: `${oldValue}`, inline: true },
//               { name: "New Value", value: `${newValue}`, inline: true },
//               {
//                 name: "Change",
//                 value: `${isIncrease ? "+" : "-"}${Math.abs(diff)} (${percentChange}%)`,
//                 inline: true,
//               },
//             ],
//             thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
//             timestamp: new Date().toISOString(),
//           },
//         ],
//       };

//       try {
//         await axios.post("http://127.0.0.1:3003", {
//           channel_id: "1386429683565858899",
//           msg: embed,
//         });
//       } catch (err) {
//         console.error("❌ Failed to send embed:", err.message);
//       }

//       return interaction.reply({
//         content: `✅ Updated item \`${itemId}\` value to **${newValue}**.`,
//         ephemeral: true,
//       });
//     } catch (err) {
//       console.error("❌ MongoDB Update Error:", err);
//       return interaction.reply({
//         content: "❌ An error occurred while updating the item.",
//         ephemeral: true,
//       });
//     } finally {
//       await mongoClient.close();
//     }
//   },

//   async handleInteraction(interaction) {
//     if (
//       interaction.isAutocomplete() &&
//       interaction.commandName === "setvalue"
//     ) {
//       const focused = interaction.options.getFocused();

//       try {
//         await mongoClient.connect();
//         const db = mongoClient.db("ArcadeHaven");
//         const items = db.collection("items");

//         const results = await items
//           .find({ name: { $regex: new RegExp(focused, "i") } })
//           .limit(10)
//           .toArray();

//         const suggestions = results.map((doc) => ({
//           name: `${doc.name} (ID: ${doc.itemId})`,
//           value: doc.itemId.toString(),
//         }));

//         await interaction.respond(suggestions);
//       } catch (err) {
//         console.error("❌ Autocomplete MongoDB Error:", err);
//       } finally {
//         await mongoClient.close();
//       }
//     }
//   },
// };
