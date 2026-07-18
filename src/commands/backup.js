// /backup
// Sends the current data/bot.json as a file attachment in Discord.
// This file contains ALL bot configuration and data - templates, messages,
// recruit history, personal API keys, alliance ID, etc.
// Admin only. The file is sent as an ephemeral message so only you see it.

const { SlashCommandBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'bot.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Download a backup of all bot configuration and data (Admin only)'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You need Administrator permission to use this.', flags: 64 });
    }

    if (!fs.existsSync(DB_PATH)) {
      return interaction.reply({
        content: '❌ No data file found yet — the bot may not have saved anything yet. Try again after using the bot for a bit.',
        flags: 64,
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `tun-bot-backup-${timestamp}.json`;

    const attachment = new AttachmentBuilder(DB_PATH, { name: filename });

    return interaction.reply({
      content:
        `📦 **Bot Backup — ${new Date().toUTCString()}**\n\n` +
        `This file contains all your bot data: templates, configured messages, recruit history, alliance settings, and personal API keys.\n\n` +
        `⚠️ **Keep this file private** — it contains sensitive data including API keys.\n\n` +
        `To restore from this backup: replace your \`data/bot.json\` file with this one and restart the bot.`,
      files: [attachment],
      flags: 64,
    });
  },
};
