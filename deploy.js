/* eslint-disable @typescript-eslint/no-var-requires */
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, token } = require('./config.json');

const rest = new REST({ version: '9' }).setToken(token);

const cmds = [
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('讓機器人加入語音頻道'),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('讓機器人離開語音頻道並清空歌曲清單'),
    new SlashCommandBuilder()
        .setName('search')
        .setDescription('顯示在YouTube搜尋到的前25個結果')
        .addStringOption(op => op
            .setName('kw')
            .setDescription('要搜尋的項目')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('在歌曲清單中新增歌曲')
        .addStringOption(op => op
            .setName('id')
            .setDescription('歌曲網址後面那串，記得別再加 https://www.youtube.com/ 之類的東西了')
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('播放歌曲清單中的歌曲'),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('暫停歌曲'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('繼續播放歌曲'),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('跳過目前歌曲'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('查看目前歌曲清單'),
];

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: cmds.map(c => c.toJSON()) },
        );
        return console.log('Finish!');
    } catch (e) {
        console.log('Some errors occurred!');
        throw e;
    }
})();