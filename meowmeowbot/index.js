const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits, Events, REST, Routes } = require("discord.js");
require("dotenv").config({
  path: path.resolve(__dirname, "../meowmeowapi/.env"),
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

// Load slash commands
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
const commands = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
}

// Register slash commands with Discord API
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands("1397899613188390912"), // replace with your bot client ID
      { body: commands }
    );
    console.log("✅ Commands registered.");
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
})();

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash command
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: "❌ Error executing command.", ephemeral: true });
    }
  }

  // Button or modal or autocomplete
  for (const cmd of client.commands.values()) {
    if (typeof cmd.handleInteraction === "function") {
      try {
        await cmd.handleInteraction(interaction);
      } catch (err) {
        console.error(`❌ Error in ${cmd.data?.name || "unknown"} handleInteraction:`, err);
      }
    }
  }
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);  
  client.user.setStatus("dnd");
  const { ActivityType } = require("discord.js");
  client.user.setActivity("Arcade Haven", { type: ActivityType.Playing });
  require("./commands/queue").startDropper(client);
});

client.login(process.env.DISCORD_TOKEN);