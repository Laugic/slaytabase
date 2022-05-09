import fetch from 'node-fetch';
import { Client, Intents } from 'discord.js';
import Fuse from 'fuse.js'
import fs from 'fs';
import commands from './commands.js';
import embed from './embed.js';
import characters from './characters.js';
import keywordify from './keywords.js';
import cfg from './cfg.js';

const bot = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES], partials: ['CHANNEL'] });

const search = new Fuse([], {
    includeScore: true,
    useExtendedSearch: true,
    keys: ['searchText'],
    distance: 1000,
});
const queryLimit = 10; //max number of embeds on a discord message
search.add({
    name: 'help',
    itemType: 'help',
});

export {bot, search};

String.prototype.unPunctuate = function() {return this.replaceAll('\n', ' ').replace(/[^\w\s?]|_/g, "").replace(/\s+/g, " ")};

bot.once('ready', async () => {
    bot.user.setActivity('Downfall | <help>');
	console.log('connected to discord. ready!');
});

async function getEmbeds(msg) {
    let queries = [...msg.content.matchAll(/\<(.*?)\>/g)].map(e => e[1]);
    if (queries.length <= queryLimit) {
        if (queries.length > 0) {
            let embeds = [];
            for (let originalQuery of queries) {
                if (!(originalQuery.startsWith('@') || originalQuery.startsWith('#') || originalQuery.startsWith(':') || originalQuery.startsWith('a:') || originalQuery.startsWith('http') || originalQuery == 'init')) {
                    let query = originalQuery.toLowerCase().unPunctuate().trim();
                    let results = search.search(query);
                    let item = results.length > 0 ? results[0] : undefined; //(query.includes('+') ? results.find(e => e.name.includes('+')) : results[0])
                    let cmdName = query.split(' ')[0];
                    if (commands.hasOwnProperty(cmdName))
                        item = {item: {
                            name: cmdName,
                            do: commands[cmdName],
                            itemType: 'command',
                        }};
                    else if (item == undefined)
                        item = {item: {
                            itemType: 'fail',
                            name: 'No results',
                        }};
                    else if (item.item.searchName != query) {
                        let exactMatch = search._docs.find(e => e.searchName == query);
                        if (exactMatch != undefined)
                            item = {item: exactMatch, score: 0};
                    }
                    console.log(`${msg.author.tag} searched for "${query}", found ${typeof item == 'object' ? `${item.item.itemType} "${item.item.name}"` : 'nothing'}`);
                    let genEmbed = await embed({...item.item, score: item.score, query}, msg, embeds);
                    if (genEmbed != null)
                        embeds.push(genEmbed)
                }
            }
            return embeds; //
        } else return 0;
    } else return null; //msg.reply("I can only take up to 10 queries at a time!").catch(e => {});
}

bot.on('messageCreate', async msg => {
    let embeds = await getEmbeds(msg);
    if (embeds === null)
        msg.reply('I can only take up to 10 queries at a time! Edit your message to use 10 or fewer queries, and I\'ll update mine.').catch(e => {});
    else if (embeds === 0)
        return;
    else
        msg.reply({embeds, allowedMentions: {repliedUser: false}}).catch(e => {});
});

bot.on('messageUpdate', async (oldMsg, newMsg) => {
    let messages = await newMsg.channel.messages.fetch();
    let reply = messages.find(i => i.author.id == bot.user.id && i.reference != null && i.reference.messageId == oldMsg.id);
    if (reply != undefined) {
        let embeds = await getEmbeds(newMsg);
        if (embeds === null)
            reply.edit({content: 'I can only take up to 10 queries at a time! Edit your message to use 10 or fewer queries, and I\'ll update mine.', embeds: []}).catch(e => {});
        else if (embeds === 0)
            reply.delete().catch(e => {});
        else
            reply.edit({content: ' ', embeds, allowedMentions: {repliedUser: false}}).catch(e => {});
    }
});

bot.on('messageDelete', async msg => {
    let messages = await msg.channel.messages.fetch();
    let reply = messages.find(i => i.author.id == bot.user.id && i.reference != null && i.reference.messageId == msg.id);
    if (reply != undefined)
        reply.delete().catch(e => {});
});

async function main() {
    console.log('loading and parsing data...');
    let data = JSON.parse(fs.readFileSync('./docs/altered/items.json'));
    for (let itemType in data)
        for (let item of data[itemType]) {
            let character = characters[''];
            if (item.type == 'Player') continue;
            switch(itemType) {
                case 'cards':
                    character = characters[item.color];
                    break;

                case 'relics':
                    character = characters[item.pool];
                    break;
            }
            let newItem = {
                ...item,
                searchName: item.name.toLowerCase().unPunctuate(),
                itemType: itemType.slice(0,-1),
                mod: item.mod == '' ? 'slay-the-spire' : item.mod.toLowerCase(),
                description: item.hasOwnProperty('description') ? keywordify(item.description, character) : null,
                character,
            };
            newItem.character[0].replace('The ', '')
            newItem.searchText = [
                    'name',
                    ['character', 0],
                    'itemType',
                    'type',
                    'color',
                    'description',
                    'tier',
                    'rarity',
                ].map(key => {
                    if (Array.isArray(key)) {
                        let look = newItem;
                        for (let j of key) {
                            if (!look.hasOwnProperty(j)) return '';
                            look = look[j];
                        }
                        return String(look).unPunctuate();
                    } else if (newItem.hasOwnProperty(key)) return String(newItem[key]).unPunctuate();
                    else return '';
                }).join(' '),
            search.add(newItem);
        }
    console.log('parsed data, connecting to discord...');
    bot.login(cfg.token);
}

main();