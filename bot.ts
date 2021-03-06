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
        if (!channel) return cmd.followUp('??????????????????????????????????????????...');
        if (this.queue[guildId].length === 0) return channel.send('???????????????????????????...');
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
                channel.send(`???????????????${song.title}`);
            });
            player.once(AudioPlayerStatus.Idle, () => {
                if (this.queue[guildId].length > 0) play();
                else {
                    channel.send('???????????????????????????...');
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
                if (!cmd.guild) return cmd.editReply('?????????????????????????????????????????????');
                switch (cmd.commandName) {
                    case 'join': {
                        if (this.connections[cmd.guild.id]) return cmd.editReply('??????????????????????????????????????????');
                        const succeed = this.joinChannel(cmd);
                        if (!succeed) return cmd.editReply('??????????????????????????????');
                        this.connections[cmd.guild.id].on(VoiceConnectionStatus.Ready, () => {
                            cmd.editReply('????????????????????????');
                        });
                        break;
                    }

                    case 'leave': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('...??????????????????????????????...');
                        const succeed = this.leaveChannel(cmd.guild.id);
                        if (!succeed) return cmd.editReply('??????????????????...');
                        cmd.editReply('????????????????????????');
                        break;
                    }

                    case 'search': {
                        const kw = cmd.options.getString('kw', true);
                        const res = await this.searchYT(kw);
                        if (!res) return cmd.editReply('????????????????????????');
                        const embed = new MessageEmbed()
                            .setColor('RED')
                            .setTitle(`???????????????${kw}`);
                        res.filter((_, i) => i < 25).forEach(v => {
                            embed.addField(v.title, `${v.duration ? `${v.duration}  ` : ''}${v.id}`);
                        });
                        cmd.editReply({ embeds: [embed] });
                        break;
                    }

                    case 'add': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('???????????????????????????????????????');
                        const videoId = cmd.options.getString('id', true);
                        const [succeed, title] = await this.addSong(videoId, cmd.guild.id);
                        if (!succeed) cmd.editReply('???????????????...???????????????????????????');
                        else cmd.editReply(`?????????${title}??????????????????`);
                        break;
                    }

                    case 'play': {
                        if (!this.connections[cmd.guild.id]) return cmd.editReply('???????????????????????????????????????');
                        if (this.isPlaying[cmd.guild.id]) return cmd.editReply('??????????????????????????????');
                        cmd.editReply('????????????????????????...');
                        this.play(cmd, cmd.guild.id);
                        break;
                    }

                    case 'pause': {
                        if (!this.isPlaying[cmd.guild.id]) return cmd.editReply('...??????????????????????????????...');
                        if (this.isPaused[cmd.guild.id]) return cmd.editReply('?????????????????????????????????');
                        if (this.pause(cmd.guild.id)) cmd.editReply('??????????????????');
                        else cmd.editReply('??????...?????????????????????????????????????????????...');
                        break;
                    }

                    case 'resume': {
                        if (!this.isPaused[cmd.guild.id]) return cmd.editReply('??????...??????????????????????????????????????????????????????');
                        if (this.resume(cmd.guild.id)) cmd.editReply('????????????');
                        else cmd.editReply('?????????????????????????????????????????????...');
                        break;
                    }

                    case 'skip': {
                        if (!this.isPlaying[cmd.guild.id]) return cmd.editReply('??????????????????????????????????????????...');
                        if (this.isPaused[cmd.guild.id]) return cmd.editReply('???????????????????????????????????????????????????...');
                        this.skip(cmd, cmd.guild.id);
                        break;
                    }

                    case 'queue': {
                        if (!this.queue[cmd.guild.id]) return cmd.editReply('???????????????????????????');
                        cmd.editReply(this.getQueue(cmd.guild.id));
                        break;
                    }

                    default: {
                        cmd.editReply('???????????????????????????????????????');
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