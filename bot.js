const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1573680873646329887";
const PREFIX = "!";
const DATA_FILE = path.join(__dirname, "catbot-data.json");

if (!TOKEN) throw new Error("La variable DISCORD_TOKEN est manquante.");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

let db = { users: {}, guilds: {} };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (error) {
  console.error("Impossible de lire catbot-data.json :", error);
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function userData(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (!db.users[key]) db.users[key] = { berries: 0, lastDaily: 0, lastWork: 0, xp: 0, level: 0, warns: 0 };
  return db.users[key];
}
function guildData(guildId) {
  if (!db.guilds[guildId]) db.guilds[guildId] = { prefix: PREFIX };
  return db.guilds[guildId];
}
const cooldowns = new Map();
function cooldown(key, seconds) {
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + seconds * 1000);
  return 0;
}
function topUsers(guildId) {
  return Object.entries(db.users)
    .filter(([key]) => key.startsWith(`${guildId}:`))
    .sort((a, b) => b[1].berries - a[1].berries)
    .slice(0, 10);
}
function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.KickMembers);
}
function helpText() {
  return [
    "**🍓 ÉCONOMIE**",
    "`/balance` `!balance` — voir ses Berries",
    "`/daily` `!daily` — récompense quotidienne",
    "`/work` `!work` — gagner des Berries",
    "`/give` `!give @membre montant` — donner des Berries",
    "`/leaderboard` `!leaderboard` — classement",
    "",
    "**🎮 JEUX**",
    "`/coinflip` `!coinflip` — pile ou face",
    "`/dice` `!dice` — lancer un dé",
    "",
    "**🛡️ MODÉRATION**",
    "`/clear` `!clear nombre` — supprimer des messages",
    "`/kick` `!kick @membre [raison]`",
    "`/ban` `!ban @membre [raison]`",
    "`/warn` `!warn @membre` — avertissement",
    "",
    "**📊 INFOS**",
    "`/ping` `!ping` — latence",
    "`/server` `!server` — infos du serveur",
    "`/userinfo` `!userinfo [@membre]`",
    "",
    "**⭐ NIVEAUX**",
    "Les membres gagnent de l'XP en discutant. `!rank` / `/rank` affiche leur niveau."
  ].join("\n");
}

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Affiche les commandes de CatBot"),
  new SlashCommandBuilder().setName("ping").setDescription("Vérifie si CatBot répond"),
  new SlashCommandBuilder().setName("balance").setDescription("Affiche ton solde de Berries"),
  new SlashCommandBuilder().setName("daily").setDescription("Récupère ta récompense quotidienne"),
  new SlashCommandBuilder().setName("work").setDescription("Travaille pour gagner des Berries"),
  new SlashCommandBuilder().setName("give").setDescription("Donne des Berries à un membre")
    .addUserOption(o => o.setName("membre").setDescription("Destinataire").setRequired(true))
    .addIntegerOption(o => o.setName("montant").setDescription("Nombre de Berries").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Classement des Berries"),
  new SlashCommandBuilder().setName("coinflip").setDescription("Joue à pile ou face"),
  new SlashCommandBuilder().setName("dice").setDescription("Lance un dé"),
  new SlashCommandBuilder().setName("rank").setDescription("Affiche ton niveau"),
  new SlashCommandBuilder().setName("server").setDescription("Informations sur le serveur"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Informations sur un membre")
    .addUserOption(o => o.setName("membre").setDescription("Membre à consulter")),
  new SlashCommandBuilder().setName("clear").setDescription("Supprime des messages (modération)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("nombre").setDescription("Nombre de messages (1 à 100)").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("kick").setDescription("Expulse un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre à expulser").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison")),
  new SlashCommandBuilder().setName("ban").setDescription("Bannit un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre à bannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison")),
  new SlashCommandBuilder().setName("warn").setDescription("Avertit un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre averti").setRequired(true))
];
const commandJSON = commands.map(c => c.toJSON());

async function runCommand(name, args, ctx) {
  const { guild, user, member, reply, getUser, getNumber, getText } = ctx;
  if (!guild) return reply("Cette commande doit être utilisée dans un serveur.");
  const data = userData(guild.id, user.id);

  switch (name) {
    case "help": return reply(helpText());
    case "ping": return reply(`🏓 Pong ! Latence : ${client.ws.ping} ms`);
    case "balance": return reply(`🍓 **${user.username}**, tu as **${data.berries} Berries**.`);
    case "daily": {
      const remaining = cooldown(`daily:${guild.id}:${user.id}`, 86400);
      if (remaining) return reply(`⏳ Reviens dans ${Math.ceil(remaining / 3600)} h pour ton prochain daily.`);
      data.berries += 100; save();
      return reply("🍓 Tu as reçu **100 Berries** pour ta récompense quotidienne !");
    }
    case "work": {
      const remaining = cooldown(`work:${guild.id}:${user.id}`, 3600);
      if (remaining) return reply(`⏳ Tu pourras retravailler dans ${Math.ceil(remaining / 60)} min.`);
      const amount = 20 + Math.floor(Math.random() * 81);
      data.berries += amount; save();
      return reply(`💼 Bravo ! Tu as gagné **${amount} Berries**.`);
    }
    case "give": {
      const target = await getUser();
      const amount = getNumber();
      if (!target || target.bot || target.id === user.id) return reply("❌ Choisis un autre membre (pas un bot).");
      if (!Number.isSafeInteger(amount) || amount < 1) return reply("❌ Montant invalide.");
      if (data.berries < amount) return reply("❌ Tu n'as pas assez de Berries.");
      const receiver = userData(guild.id, target.id);
      data.berries -= amount; receiver.berries += amount; save();
      return reply(`🍓 ${user} a envoyé **${amount} Berries** à ${target}.`);
    }
    case "leaderboard": {
      const rows = topUsers(guild.id);
      if (!rows.length) return reply("Le classement est vide pour le moment.");
      return reply("🏆 **Classement des Berries**\n" + rows.map(([key, u], i) =>
        `**${i + 1}.** <@${key.split(":")[1]}> — ${u.berries} 🍓`).join("\n"));
    }
    case "coinflip": return reply(`🪙 Résultat : **${Math.random() < 0.5 ? "Pile" : "Face"}** !`);
    case "dice": return reply(`🎲 Tu as obtenu **${1 + Math.floor(Math.random() * 6)}**.`);
    case "rank": return reply(`⭐ **${user.username}** — niveau **${data.level}** · ${data.xp} XP`);
    case "server": return reply(`📊 **${guild.name}**\nMembres : ${guild.memberCount}\nCréé le : <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`);
    case "userinfo": {
      const target = await getUser() || user;
      const m = await guild.members.fetch(target.id).catch(() => null);
      return reply(`👤 **${target.username}**\nID : \`${target.id}\`\nCompte créé : <t:${Math.floor(target.createdTimestamp / 1000)}:D>\nA rejoint : ${m ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:D>` : "inconnu"}`);
    }
    case "clear": {
      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return reply("❌ Permission Gérer les messages requise.");
      const n = getNumber();
      if (!Number.isInteger(n) || n < 1 || n > 100) return reply("Choisis un nombre entre 1 et 100.");
      const channel = ctx.channel;
      const deleted = await channel.bulkDelete(n, true);
      return reply(`🧹 ${deleted.size} message(s) supprimé(s).`);
    }
    case "kick":
    case "ban": {
      const permission = name === "kick" ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers;
      if (!member.permissions.has(permission)) return reply("❌ Tu n'as pas la permission nécessaire.");
      const target = await getUser();
      if (!target) return reply("Membre introuvable.");
      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (!targetMember) return reply("Ce membre n'est pas sur le serveur.");
      if (!targetMember.manageable) return reply("Je ne peux pas agir sur ce membre : vérifie mon rôle.");
      const reason = getText() || "Aucune raison fournie";
      if (name === "kick") await targetMember.kick(reason);
      else await targetMember.ban({ reason });
      return reply(`✅ ${target.username} a été ${name === "kick" ? "expulsé" : "banni"}.`);
    }
    case "warn": {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return reply("❌ Permission Modérer les membres requise.");
      const target = await getUser();
      if (!target || target.bot || target.id === user.id) return reply("Membre invalide.");
      userData(guild.id, target.id).warns++;
      save();
      return reply(`⚠️ ${target} a reçu un avertissement. Total : **${userData(guild.id, target.id).warns}**.`);
    }
    default: return reply("Commande inconnue. Utilise `/help` ou `!help`.");
  }
}

client.once("ready", () => console.log(`🐈‍⬛ ${client.user.tag} est connecté !`));

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  const data = userData(message.guild.id, message.author.id);
  data.xp += 5 + Math.floor(Math.random() * 6);
  const needed = (data.level + 1) * 100;
  if (data.xp >= needed) {
    data.xp -= needed; data.level++;
    message.channel.send(`🎉 ${message.author} passe au niveau **${data.level}** !`);
  }
  save();

  const prefix = guildData(message.guild.id).prefix || PREFIX;
  if (!message.content.toLowerCase().startsWith(prefix)) return;
  const parts = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = (parts.shift() || "").toLowerCase();
  if (!name) return;
  const mentioned = message.mentions.users.first();
  const number = parts.find(x => /^\d+$/.test(x));
  const reason = parts.slice(mentioned ? 1 : 0).filter(x => !/^\d+$/.test(x)).join(" ");
  try {
    await runCommand(name, parts, {
      guild: message.guild, user: message.author, member: message.member,
      channel: message.channel,
      reply: text => message.reply(text),
      getUser: async () => mentioned || null,
      getNumber: () => number ? Number(number) : NaN,
      getText: () => reason
    });
  } catch (e) {
    console.error(e);
    message.reply("❌ Une erreur est survenue. Vérifie mes permissions et réessaie.").catch(() => {});
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();
  try {
    await runCommand(interaction.commandName, [], {
      guild: interaction.guild, user: interaction.user, member: interaction.member,
      channel: interaction.channel,
      reply: text => interaction.editReply(text),
      getUser: async () => interaction.options.getUser("membre"),
      getNumber: () => interaction.options.getInteger("montant") ?? interaction.options.getInteger("nombre"),
      getText: () => interaction.options.getString("raison")
    });
  } catch (e) {
    console.error(e);
    await interaction.editReply("❌ Une erreur est survenue. Vérifie mes permissions et réessaie.").catch(() => {});
  }
});

async function startBot() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandJSON });
  await client.login(TOKEN);
}
startBot().catch(error => console.error("Erreur au démarrage :", error));
