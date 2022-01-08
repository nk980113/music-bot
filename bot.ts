import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import {
    Client,
    CommandInteraction,
    GuildMember,
    MessageEmbed,
} from 'discord.js';
import ytsr from 'ytsr';
import ytdl from 'ytdl-core';
import { token, deploy } from './config.json';

class MusicCenter {
    // Singleton config
    private static instance: MusicCenter;

    static getInstance(client: Client) {
        if (!this.instance) this.instance = new MusicCenter(client);
        return this.instance;
    }

    // Main class
    private isPlaying: { [guildId: string]: boolean } = {};
    private isPaused: { [guildId: string]: boolean } = {};
    private connections: { [guildId: string]: VoiceConnection } = {};
    private players: { [guildId: string]: AudioPlayer } = {};
    private queue: {
        [guildId: string]: {
            songUrl: string;
            title: string;
        }[];
    } = {};

    private constructor(
        private client: Client,
    ) {} // eslint-disable-line no-empty-function

    private joinChannel(cmd: CommandInteraction) {
        const member = <GuildMember>cmd.member;
        if (!member) return false;
        const { channel } = member.voice;
        if (!channel) return false;
        this.connections[channel.guild.id] = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: <DiscordGatewayAdapterCreator>channel.guild.voiceAdapterCreator,
        });
        return true;
    }

    private leaveChannel(guildId: string) {
        try {
            const player = this.players[guildId];
            if (player) {
                player.removeAllListeners();
                player.stop();
                delete this.players[guildId];
            }
            const connection = this.connections[guildId];
            connection.destroy();
            delete this.connections[guildId];
            if (this.queue[guildId]) delete this.queue[guildId];
            this.isPlaying[guildId] = false;
            this.isPaused[guildId] = false;
            return true;
        } catch {
            return false;
        }
    }

    private async searchYT(kw: string) {
        try {
            const res = await ytsr(kw);
            const result = res.items
                .filter(i => i.type === 'video') as ytsr.Video[];

            return result.map(v => ({
                title: v.title,
                id: v.url.replace('https://www.youtube.com/watch?v=', ''),
                duration: v.duration,
            }));
        } catch {
            return null;
        }
    }

    private async addSong(id: string, guildId: string) {
        try {
            const songUrl = `https://www.youtube.com/watch?v=${id}`;
            const res = await ytdl.getInfo(songUrl);
            const { title } = res.videoDetails;
            if (!this.queue[guildId]) this.queue[guildId] = [];
            this.queue[guildId].push({
                title,
                songUrl,
            });
            return [true, title];
        } catch {
            return [false, ''];
        }
    }

    private play(cmd: CommandInteraction, guildId: string) {
        const { channel } = cmd;
        if (!channel) return cmd.followUp('找不到給我發訊息的頻道，嗚嗚...');
        if (this.queue[guildId].length === 0) return channel.send('好像沒有歌給我播呢...');
        this.isPlaying[guildId] = true;
        const player = this.players[guildId] = createAudioPlayer();
        this.connections[guildId].subscribe(player);
        const play = () => {
            const song = this.queue[guildId].shift();
            if (!song) return;

            const audioStream = ytdl(song.songUrl, { filter: 'audioonly' });
            const audioResource = createAudioResource(audioStream);
            player.play(audioResource);
            player.once(AudioPlayerStatus.Playing, () => {
                channel.send(`正在播放：${song.title}`);
            });
            player.once(AudioPlayerStatus.Idle, () => {
                if (this.queue[guildId].length > 0) play();
                else {
                    channel.send('好像沒有歌可以播了...');
                    this.isPlaying[guildId] = false;
                }
            });
        };
        play();
    }

    private pause(guildId: string) {
        const succeed = this.players[guildId].pause();
        this.isPaused[guildId] = succeed;
        return succeed;
    }

    private resume(guildId: string) {
        const succeed = this.players[guildId].unpause();
        this.isPaused[guildId] = !succeed;
        return succeed;
    }

    private skip(cmd: CommandInteraction, guildId: string) {
        const player = this.players[guildId];
        player.removeAllListeners();
        player.stop();
        this.play(cmd, guildId);
    }

    private getQueue(guildId: string) {
        return this.queue[guildId].map((s, i) => `\`[${i + 1}]\` ${s.title}`).join('\n');
    }

    setup(client = this.client) {
        client.on('interactionCreate', async (cmd): Promise<void> => {
            await (async () => {
                if (!cmd.isCommand()) return;
                await cmd.deferReply();
                if (!cmd.guild) return cmd.editReply('這台機器人只能在伺服器內使用！');
                switch (cmd.commandName) {
                    case 'join': {
                        if (this.connections[cmd.guild.id]) return cmd.editReply('你沒看到我人已經在裡面了嗎？');
                        const succeed = this.joinChannel(cmd);
                        if (!succeed) return cmd.editReply('你有加入語音頻道嗎？');
                        this.connections[cmd.guild.id].on(VoiceConnectionStatus.Ready, () => {
                            cmd.editReply('成功加入語音頻道');
                        });
                        break;
                    }

                    case 'leave': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('...正在離開不存在的頻道...');
                        const succeed = this.leaveChannel(cmd.guild.id);
                        if (!succeed) return cmd.editReply('這東西怪怪的...');
                        cmd.editReply('成功離開語音頻道');
                        break;
                    }

                    case 'search': {
                        const kw = cmd.options.getString('kw', true);
                        const res = await this.searchYT(kw);
                        if (!res) return cmd.editReply('尷尬，出了點問題');
                        const embed = new MessageEmbed()
                            .setColor('RED')
                            .setTitle(`搜尋結果：${kw}`);
                        res.filter((_, i) => i < 25).forEach(v => {
                            embed.addField(v.title, `${v.duration ? `${v.duration}  ` : ''}${v.id}`);
                        });
                        cmd.editReply({ embeds: [embed] });
                        break;
                    }

                    case 'add': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('先讓我加入語音頻道再說啦！');
                        const videoId = cmd.options.getString('id', true);
                        const [succeed, title] = await this.addSong(videoId, cmd.guild.id);
                        if (!succeed) cmd.editReply('好像怪怪的...你確定有這首歌嗎？');
                        else cmd.editReply(`成功將${title}加入歌曲清單`);
                        break;
                    }

                    case 'play': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('先讓我加入語音頻道再說啦！');
                        if (this.isPlaying[cmd.guild.id]) return cmd.editReply('已經在播放歌曲了啦！');
                        cmd.editReply('正在進行播放程序...');
                        this.play(cmd, cmd.guild.id);
                        break;
                    }

                    case 'pause': {
                        if (!this.isPlaying[cmd.guild.id]) return cmd.editReply('...正在暫停不存在的歌曲...');
                        if (this.isPaused[cmd.guild.id]) return cmd.editReply('這首歌已經被暫停了啦！');
                        if (this.pause(cmd.guild.id)) cmd.editReply('成功暫停歌曲');
                        else cmd.editReply('不行...這捲錄音帶自戀到無法自拔的地步...');
                        break;
                    }

                    case 'resume': {
                        if (!this.isPaused[cmd.guild.id]) return cmd.editReply('等等...歌沒有被暫停啊？還是你根本沒有放歌？');
                        if (this.resume(cmd.guild.id)) cmd.editReply('繼續播放');
                        else cmd.editReply('錄音帶掉入萬丈深淵，等待救援中...');
                        break;
                    }

                    case 'skip': {
                        if (!this.isPlaying[cmd.guild.id]) return cmd.editReply('意義上，沒有歌在播好像不能跳...');
                        if (this.isPaused[cmd.guild.id]) return cmd.editReply('請先繼續播放音樂，不然播放器會壞掉...');
                        this.skip(cmd, cmd.guild.id);
                        break;
                    }

                    case 'queue': {
                        if (!this.queue[cmd.guild.id]) return cmd.editReply('你確定這有東西嗎？');
                        cmd.editReply(this.getQueue(cmd.guild.id));
                        break;
                    }

                    default: {
                        cmd.editReply('尷尬了，沒有這個指令的資料');
                    }
                }
            })();
        });
    }
}

const client = new Client({ intents: ['GUILDS', 'GUILD_VOICE_STATES'] });

const musicCenter = MusicCenter.getInstance(client);

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
});

musicCenter.setup();

client.login(token);

// Deploy
if (deploy) (async () => {
    const { exec } = await import('child_process');
    exec('node deploy.js');
});