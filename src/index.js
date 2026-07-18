// This is the file you run to start the bot: node src/index.js
// It loads your settings, connects to Discord, and loads all commands/events.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { startNewNationScanner } = require('./scheduler/newNationScanner');
const { startFollowUpScanner } = require('./scheduler/followUpScanner');
const { startAllianceExitScanner } = require('./scheduler/allianceExitScanner');
const { startApplicantScanner } = require('./scheduler/applicantScanner');

// Make sure required settings exist before we even try to start.
const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'PNW_API_KEY'];
for (const key of required) {
  if (!process.env[key] || process.env[key].startsWith('paste_')) {
    console.error(`❌ Missing or unfilled setting: ${key}. Check your .env file.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();

// Load every command file in src/commands/
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Load every event file in src/events/
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

client.login(process.env.DISCORD_TOKEN);

client.once('clientReady', () => {
  startNewNationScanner(client);
  startFollowUpScanner(client);
  startAllianceExitScanner(client);
  startApplicantScanner(client);
});
