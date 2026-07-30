// Run this file whenever you add/change slash commands:
// node src/deployCommands.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Registering ${commands.length} global slash command(s)...`);

        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );

        console.log('✅ Global slash commands registered successfully!');
        console.log('ℹ️ They may take a few minutes (sometimes up to an hour) to appear in every server.');
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
})();
