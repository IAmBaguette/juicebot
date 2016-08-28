
var fs = require("fs");
var ytdl = require("ytdl-core");
var Discord = require("discord.js");

var myBot = new Discord.Client({ autoReconnection: true });

var cmds = require("./cmds.json");
var servers = require("./servers.json");
var package = require("./package.json");
var config = require("./config.json");

var yt_header = "http://www.youtube.com/watch?v="

// Emitted when the client is ready to use
myBot.on("ready", function () {
    //var server 
    // mybot.servers.forEach(function (value) {
    //     if (value.id )
    //     servers.push({ "id": value.id, "stopPlaying": false, "volume": 0.5, "loop": false });
    // });
});

// Emitted when the client receives a message, supplies a Message object.
myBot.on("message", function (message) {
    filterCommand(message);
});

myBot.on("serverCreated", function (server) {
    var db_server = servers.filter(function (value) {
        return value.id == server.id;
    });

    if (db_server.length > 0) {
        console.log("server already exists");
    } else {
        servers.push({ "id": server.id, "mods": [], "volume": 50 });
        writeToJSON("./servers.json", servers);
    }
});

myBot.on("serverDeleted", function (server) {
    var db_server = servers.filter(function (value) {
        return value.id == server.id;
    });

    if (db_server.length > 0) {
        var index = servers.indexOf(db_server);
        servers.splice(index, 1);
        writeToJSON("./servers.json", servers);
    }
});

// Emitted when the client runs into a big problem, supplies an error object.
myBot.on("error", function (error) {
    console.log(error + " < error");
    myBot.logout();
});

myBot.loginWithToken(config.token);


function filterCommand(message) {
    var author = message.author;
    var channel = message.channel;
    if (message.content[0] == "!") {
        var msg = message.content.substring(1, message.content.length)
        cmds.forEach(function (cmd) {
            if (msg.startsWith(cmd.name)) {
                var args = msg.replace(cmd.name, "");
                switch (cmd.name) {
                    case "help":
                        if (msg.startsWith(cmd.name + " ")) {
                            help(message, args.substring(1, args.length));
                        } else {
                            if (isUserOwnerOrMod(author, channel)) {
                                myBot.reply(message, "\n" + modHelp());
                            } else {
                                myBot.reply(message, "\n" + userHelp());
                            }
                        }
                        break;
                    case "info":
                        myBot.reply(
                            message,
                            "\n```" +
                            "App: " + package.name + "\n" +
                            "Version: " + package.version + "\n" +
                            "Author: " + package.author.name + "```\n");
                        break;
                    case "play":
                        if (msg.startsWith(cmd.name + " ")) {
                            if (isUserOwnerOrMod(author, channel)) {
                                play(author, message.channel, args.substring(1, args.length));
                                break;
                            }
                        }
                    case "stop":
                        if (isUserOwnerOrMod(author, channel)) {
                            stop(author, message.channel);
                        }
                        break;
                    case "volume":
                        if (msg.startsWith(cmd.name + " ")) {
                            if (isUserOwnerOrMod(author, channel)) {
                                volume(author, message, args.substring(1, args.length));
                            }
                        }
                        break;
                    case "me":
                        myBot.reply(message, message.author.id);
                        break;
                    case "mods":
                        mods(author, message.channel);
                        break;
                    case "mod":
                        if (msg.startsWith(cmd.name + " ")) {
                            // requires owner permission
                            mod(author, message.channel, args.substring(1, args.length));
                        }
                        break;
                    case "unmod":
                        if (msg.startsWith(cmd.name + " ")) {
                            // requires owner permission
                            unmod(author, message.channel, args.substring(1, args.length));
                        }
                        break;
                    default:
                        break;
                }
            }
        });
    }
}

function help(message, name) {
    cmds.forEach(function (cmd) {
        if (name == cmd.name) {
            switch (cmd.name) {
                case "play":
                case "stop":
                case "volume":
                case "mod":
                case "unmod":
                    if (!isUserOwnerOrMod(message.author, message.channel)) {
                        return;
                    }
                    break;
                default:
                    break;
            }
            myBot.reply(message, "\n```" + cmd.description + "```");
        }
    });
}

function modHelp() {
    var msg = "Commands: ";
    cmds.forEach(function (cmd) {
        msg += "`" + cmd.name + "`, ";
    });
    msg = msg.substring(0, msg.length - 2);
    return msg;
}

function userHelp() {
    var msg = "Commands: ";
    cmds.forEach(function (cmd) {
        switch (cmd.name) {
            case "help":
            case "info":
            case "me":
            case "mods":
                msg += "`" + cmd.name + "`, ";
                break;
            default:
                break;
        }
    });
    msg = msg.substring(0, msg.length - 2);
    return msg;
}

function play(user, channel, id) {
    ytdl.getInfo(yt_header + id, {}, function (error, info) {
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
            myBot.sendMessage(channel, "Loading: `" + info.title + "`");
            ytdl(yt_header + id, { filter: "audioonly" })
                .pipe(fs.createWriteStream("./playback.mp3"))
                .on("finish", function () {
                    myBot.joinVoiceChannel(user.voiceChannel, function (error, voiceConnection) {
                        if (error) {
                            console.log(error, error.message, error.name);
                            throw error;
                        } else {
                            if (voiceConnection.playingIntent) {
                                voiceConnection.playingIntent.removeAllListeners("end");
                            }
                            voiceConnection.stopPlaying();
                            var server = getServerFromDB(channel.server);
                            voiceConnection.setVolume(server.volume / 100);
                            voiceConnection.playFile("./playback.mp3", {}, function (error, indent) {
                                if (error) {
                                    console.log(error, error.message, error.name);
                                    throw error;
                                } else {
                                    // send a message to the users that we've successfully playing a song
                                    myBot.sendMessage(channel, "Playing: `" + info.title + "`");
                                    // on song end
                                    indent.on("end", function () {
                                        myBot.leaveVoiceChannel(user.voiceChannel, function (error) {
                                            if (error) {
                                                throw error;
                                            }
                                        });
                                    });
                                }
                            });
                        }
                    });
                });
        }
    });
}

function stop(user, channel) {
    if (user.voiceChannel) {
        var voiceConnection = getVoiceConnection(user);
        if (voiceConnection) {
            // only stop the music bot if it is playing
            if (voiceConnection.playing) {
                voiceConnection.stopPlaying();
            }
        }
    }
}

function volume(user, message, amount) {
    var server = getServerFromDB(message.channel.server);
    var value = Number(amount);
    if (!isNaN(value)) {
        value = clamp(value, 0, 100);
        server.volume = value;
        writeToJSON("./servers.json", servers);
        myBot.sendMessage(message.channel, "Volume set at: `" + value + "`%");
    } else {
        myBot.reply(messag, "Value entered is invalid");
        return;
    }

    var voiceConnection = getVoiceConnection(user);
    if (voiceConnection) {
        voiceConnection.setVolume(value / 100);
    }
}

function mods(user, channel) {
    var server = getServerFromDB(channel.server);
    var msg = "There are no mods!";
    if (server.mods.length > 0) {
        msg = "List of mods: \n";
        server.mods.forEach(function (value) {
            var name = getUser(value.id, channel.server).username;
            msg += "id: `" + value.id + "` name: `" + name + "`\n";
        });
    }
    myBot.sendMessage(channel, msg);
}

function mod(user, channel, id) {
    if (isUserServerOwner(user, channel)) {
        var targetUser = getUser(id, channel.server);
        if (targetUser) {
            var server = getServerFromDB(channel.server);
            var mods = server.mods.filter(function (value) {
                return value.id == targetUser.id;
            });
            if (mods.length > 0) {
                console.log("already exist");
            } else {
                myBot.sendMessage(channel, "Modding `" + targetUser.username + "`");
                // add a new mod
                server.mods.push({ "id": targetUser.id });
                // save changes
                writeToJSON("./servers.json", servers);
            }
        } else {
            console.log("user doesn't exist");
        }
    }
}

function unmod(user, channel, id) {
    if (isUserServerOwner(user, channel)) {
        var targetUser = getUser(id, channel.server);
        if (targetUser) {
            var server = getServerFromDB(channel.server);
            var mods = server.mods.filter(function (value) {
                return value.id == targetUser.id;
            });
            if (mods.length > 0) {
                myBot.sendMessage(channel, "Unmodding `" + targetUser.username + "`");
                // remove mod
                var index = server.mods.indexOf(mods[0]);
                server.mods.splice(index, 1);
                // save changes
                writeToJSON("./servers.json", servers);
            } else {
                console.log("mod doesn't exist");
            }
        } else {
            console.log("user doesn't exist");
        }
    }
}

function isUserOwnerOrMod(user, channel) {
    return isUserServerOwner(user, channel) || isUserMod(user, channel);
}

function isUserServerOwner(user, channel) {
    return user.id == channel.server.ownerID;
}

function isUserMod(user, channel) {
    var server = getServerFromDB(channel.server);
    var mods = server.mods.filter(function (value) {
        return value.id == user.id;
    });
    if (mods.length > 0) {
        return mods[0];
    } else {
        return undefined;
    }
}

function getUser(id, server) {
    var server = myBot.servers.filter(function (value) {
        return value.id == server.id;
    })[0];
    var user = server.members.filter(function (value) {
        return value.id == id;
    });
    if (user.length > 0) {
        return user[0];
    } else {
        return undefined;
    }
}

function getServerFromDB(server) {
    return servers.filter(function (value) {
        return value.id == server.id;
    })[0];
}

// get voice connection of the users voice channel
function getVoiceConnection(user) {
    var results = myBot.voiceConnections.filter(function (voiceConnection) {
        return user.voiceChannel == voiceConnection.voiceChannel;
    });

    if (results.length > 0) {
        return results[0];
    } else {
        return undefined;
    }
}

function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
};

function writeToJSON(fileName, object) {
    fs.writeFile(fileName, JSON.stringify(object, null, 4), function (err) {
        if (err) { console.log(err); }
    });
}