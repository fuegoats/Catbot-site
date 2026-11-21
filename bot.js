
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1573680873646329887";

if (!TOKEN) {
  throw new Error("Le token Discord est manquant !");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Vérifie si CatBot est en ligne !")
];

async function startBot() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands.map(command => command.toJSON()) }
  );

  await client.login(TOKEN);
}

client.on("ready", () => {
  console.log(`🐈‍⬛ ${client.user.tag} est connecté !`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🍭 Miaou ! CatBot est en ligne !");
  }
});

startBot().catch(console.error);

