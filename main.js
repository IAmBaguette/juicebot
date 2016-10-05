"use strict";

const fs = require('fs');
const ytdl = require('ytdl-core');
const Discord = require('discord.js');
const client = new Discord.Client();

const config = require(__dirname + '/config.json');
const commands = require(__dirname + '/commands.json');
const servers = require(__dirname + '/servers.json');
const handlers = {
    'help': help,
    'info': info,
    'join': join,
    'leave': leave,
    'play': play,
    'stop': stop,
    'volume': volume,
    'queue': queue,
    'clear': clear,
    'me': me,
    'mods': mods,
    'mod': mod,
    'unmod': unmod
};
const queues = {};
const yt_prefix = "http://www.youtube.com/watch?v=";
const prefix = '!';

client.on('ready', () => {

});

client.on('message', (message) => {
    filter(message);
});

client.on('guildCreate', (guild) => {
    const server = servers[guild.id];
    if (server === undefined) {
        servers[guild.id] = {
            "mods": {},
            "volume": 50
        };
        // save
        fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
    } else {
        console.log("server already exists");
    }
});

client.on('guildDelete', (guild) => {
    const server = servers[guild.id];

    if (server) {
        delete servers[guild.id];
        // save
        fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
    }
});

client.on('gulpMemberRemove', (guild, member) => {
    const server = servers[guild.id];

    if (server) {
        const mod = server.mods[member.id];
        if (mod) {
            delete server.mods[member.id];
            // save
            fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
        }
    }
});

client.login(config.token);

function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
};

function getAccessLevel(msg) {
    if (msg.channel.guild.ownerID === msg.author.id) return 2;
    const id = msg.channel.guild.id;
    const server = servers[id];
    if (server.mods[msg.author.id] !== undefined) return 1;
    return 0;
}

function filter(msg) {
    for (let key in commands) {
        if (!commands.hasOwnProperty(key)) continue;
        const args = msg.content.split(" ");
        if (args[0] !== prefix + key) continue;
        args.shift();
        const accesslevel = getAccessLevel(msg);
        if (accesslevel >= commands[key].accesslevel) {
            handlers[key](msg, ...args);
        }
    }
}

function help(msg, name) {
    const accesslevel = getAccessLevel(msg);
    if (name) {
        if (commands.hasOwnProperty(name)) {
            if (accesslevel >= commands[name].accesslevel) {
                msg.reply("\n```" + commands[name].description + "```");
            }
        } else {
            msg.reply("command doesn't exist");
        }
    } else {
        let s = "Commands: ";
        for (let key in commands) {
            if (!commands.hasOwnProperty(key)) continue;
            if (accesslevel >= commands[key].accesslevel) {
                s += "`" + key + "`, "
            }
        }
        s = s.substr(0, s.length - 2);
        msg.reply(s);
    }
}

function info(msg) {
    msg.reply(
        "\n```" +
        "App: JuiceBot\n" +
        "Version: 0.12.0\n" +
        "Author: IAmBaguette```\n");
}

function join(msg) {
    const voiceChannelID = msg.member.voiceChannelID;
    if (voiceChannelID === undefined) return;
    const voiceChannel = msg.member.voiceChannel;
    if (voiceChannel === undefined) return;
    voiceChannel.join()
        .then((connection) => {
            msg.channel.sendMessage("Joined: `" + connection.channel.name + "`");
        });
}

function leave(msg) {
    const id = msg.channel.guild.id;
    const voiceConnection = client.voiceConnections.get(id);
    if (voiceConnection === undefined) return;
    voiceConnection.disconnect();
    msg.channel.sendMessage("Left: `" + voiceConnection.channel.name + "`")
}

function play(msg, yt_id) {
    const id = msg.channel.guild.id;
    const voiceChannelID = msg.member.voiceChannelID;
    if (voiceChannelID === undefined) return;
    const voiceChannel = msg.member.voiceChannel;
    if (voiceChannel === undefined) return;

    console.log(queues);

    if (yt_id === undefined) {
        if (queues[id] !== undefined) {
            yt_id = queues[id].shift();
            if (yt_id === undefined) return;
        } else {
            return;
        }
    }
    const url = yt_prefix + yt_id;

    ytdl.getInfo(url, {}, function (error, info) {
        if (error) {
            if (error.message.includes("404")) {
                console.log("video doesn't exist?");
            } else if (error.message.includes("303")) {
                console.log("video id too long?");
            } else {
                console.log(error, error.message, error.name);
                throw error;
            }
        } else {
            const server = servers[id];
            const stream = ytdl(url, { filter: 'audioonly' });
            const voiceConnection = client.voiceConnections.get(id);
            if (voiceConnection) {
                // do not play another song if we are already playing one
                if (voiceConnection.player.speaking) {
                        if (yt_id !== undefined) queue(msg, yt_id);
                        return; 
                }

                const dispatcher = voiceConnection.playStream(stream, { seek: 0, volume: server.volume / 100 });
                dispatcher.on('end', () => {
                    play(msg);
                });
                msg.channel.sendMessage("Playing: `" + info.title + "`");
            } else {
                voiceChannel.join()
                    .then((connection) => {
                        connection.playStream(stream, { seek: 0, volume: server.volume / 100 });
                        const dispatcher = connection.playStream(stream, { seek: 0, volume: server.volume / 100 });
                        dispatcher.on('end', () => {
                            play(msg);
                        });
                        msg.channel.sendMessage("Playing: `" + info.title + "`");
                    })
                    .catch(console.log);
            }
        }
    });
}

function stop(msg) {
    const id = msg.channel.guild.id;
    const voiceConnection = client.voiceConnections.get(id);
    if (voiceConnection === undefined) return;
    const dispatcher = voiceConnection.player.dispatcher;
    if (dispatcher) {
        dispatcher.end();
    }
}

function volume(msg, value) {
    const id = msg.channel.guild.id;
    const server = servers[id];
    if (!isNaN(value)) {
        value = clamp(value, 0, 100);
        server.volume = value;
        // save configuration
        fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
        msg.reply(`Volume has been set at: \`${value}\`%`);

        const voiceConnection = client.voiceConnections.get(id);
        if (voiceConnection === undefined) return;
        const dispatcher = voiceConnection.player.dispatcher;
        if (dispatcher) {
            dispatcher.setVolume(value / 100);
        }
    } else {
        msg.reply(`Volume is set at: \`${server.volume}\`%`);
    }
}

function queue(msg, yt_id) {
    const id = msg.channel.guild.id;
    const url = yt_prefix + yt_id;
    ytdl.getInfo(url, {}, function (error, info) {
        if (error) {
            if (error.message.includes("404")) {
                console.log("video doesn't exist?");
            } else if (error.message.includes("303")) {
                console.log("video id too long?");
            } else {
                console.log(error, error.message, error.name);
                throw error;
            }
        } else {
            if (queues[id] === undefined) queues[id] = [];
            queues[id].push(yt_id);
            msg.channel.sendMessage(`Queued: \`${info.title}\``);
        }
    });
}

function clear(msg) {
    console.log("clear");
}

function me(msg) {
    msg.reply(msg.author.id);
}

function mods(msg) {
    const id = msg.channel.guild.id;
    const server = servers[id];
    let s = "List of mods: \n";
    for (let key in server.mods) {
        const username = client.users.get(key).username;
        s += `id: \`${key}\` name: \`${username}\`\n`;
    }
    msg.channel.sendMessage(s);
}

function mod(msg, userID) {
    const id = msg.channel.guild.id;
    const server = servers[id];
    if (server.mods[userID] === undefined) {
        const user = client.users.get(userID);
        if (user) {
            server.mods[userID] = {};
            // save
            fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
            msg.channel.sendMessage(`\`${user.username}\` is now a mod`);
        } else {
            msg.reply(`UserID doesn't exist`);
        }
    } else {
        msg.reply(`User is already a mod`);
    }
}

function unmod(msg, userID) {
    const id = msg.channel.guild.id;
    const server = servers[id];
    if (server.mods[userID] !== undefined) {
        const user = client.users.get(userID);
        if (user) {
            delete server.mods[userID];
            // save
            fs.writeFileSync(__dirname + '/servers.json', JSON.stringify(servers, null, 4));
            msg.channel.sendMessage(`\`${user.username}\` is no longer a mod`);
        } else {
            msg.reply(`UserID doesn't exist`);
        }
    }
}

// CTRL+C
if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

process.on("SIGINT", function () {
    //graceful shutdown
    process.exit();
});