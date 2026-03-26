const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const CHANNEL_TRYHARD_ID = process.env.CHANNEL_TRYHARD_ID;
const CHANNEL_FUN_ID = process.env.CHANNEL_FUN_ID;
const ROLE_TRYHARD_ID = process.env.ROLE_TRYHARD_ID;
const ROLE_FUN_ID = process.env.ROLE_FUN_ID;

const DATA_FILE = './teams.json';
const EMBEDS_FILE = './embeds.json';

// Chargement des données
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
    return {
        tryhard: { name: "Équipe Tryhard", members: [], maxMembers: "XX" },
        fun: { name: "Équipe Fun", members: [], maxMembers: "XX" },
        messages: { tryhard: null, fun: null }
    };
}

function loadEmbeds() {
    return JSON.parse(fs.readFileSync(EMBEDS_FILE, 'utf-8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Formatage de l'embed d'équipe
function formatTeamEmbed(teamType, data) {
    const embeds = loadEmbeds();
    const team = data[teamType];
    const config = embeds[teamType];

    let membersList;
    if (team.members.length > 0) {
        membersList = team.members.map((member, i) =>
            `${i + 1}. <@${member.id}> (${member.name})`
        ).join('\n');
    } else {
        membersList = config.noMembers;
    }

    const title = config.title.replace('{name}', team.name);
    const footer = config.footerText
        .replace('{count}', team.members.length)
        .replace('{max}', team.maxMembers || 'XX');
    const color = parseInt(embeds.color.replace('#', ''), 16);

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(config.description)
        .setColor(color)
        .addFields({
            name: config.membersTitle,
            value: membersList,
            inline: false
        })
        .setFooter({ text: footer })
        .setTimestamp();

    return embed;
}

// Client Discord
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

let data = loadData();

// Mise à jour du message d'équipe
async function updateTeamMessage(teamType) {
    const channelId = teamType === 'tryhard' ? CHANNEL_TRYHARD_ID : CHANNEL_FUN_ID;
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.log(`Salon introuvable pour ${teamType}`);
        return false;
    }

    const embed = formatTeamEmbed(teamType, data);
    const messageId = data.messages[teamType];

    try {
        if (messageId) {
            try {
                const message = await channel.messages.fetch(messageId);
                await message.edit({ content: '', embeds: [embed] });
                return true;
            } catch (err) {
                if (err.code !== 10008) throw err; // 10008 = Unknown Message
            }
        }

        // Créer un nouveau message si pas trouvé
        const newMessage = await channel.send({ embeds: [embed] });
        data.messages[teamType] = newMessage.id;
        saveData(data);
        return true;

    } catch (err) {
        console.error(`Erreur lors de la mise à jour du message: ${err}`);
        return false;
    }
}

// Enregistrement des commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('equipe')
        .setDescription('Gère les équipes des 24h Info')
        .addStringOption(option =>
            option.setName('equipe')
                .setDescription("L'équipe à modifier")
                .setRequired(true)
                .addChoices(
                    { name: 'Tryhard 🔥', value: 'tryhard' },
                    { name: 'Fun 🎉', value: 'fun' }
                ))
        .addStringOption(option =>
            option.setName('action')
                .setDescription("L'action à effectuer")
                .setRequired(true)
                .addChoices(
                    { name: 'Ajouter un membre', value: 'add' },
                    { name: 'Retirer un membre', value: 'remove' },
                    { name: 'Modifier le nom', value: 'edit' },
                    { name: 'Modifier le max de membres', value: 'update' }
                ))
        .addUserOption(option =>
            option.setName('membre')
                .setDescription('Le membre à ajouter/retirer')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('nom')
                .setDescription("Le nouveau nom de l'équipe")
                .setRequired(false))
        .addStringOption(option =>
            option.setName('max')
                .setDescription("Nombre max de membres (ex: 4, XX)")
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('init')
        .setDescription('Initialise les messages dans les salons'),

    new SlashCommandBuilder()
        .setName('liste')
        .setDescription('Affiche la liste des équipes')
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Enregistrement des commandes slash...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log('Commandes enregistrées !');
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement des commandes:', err);
    }
}

// Événements
client.once('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    console.log(`Owner ID: ${OWNER_ID}`);
    registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Commande /equipe
    if (commandName === 'equipe') {
        // Vérification propriétaire
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: '❌ Seul le propriétaire peut utiliser cette commande.',
                ephemeral: true
            });
        }

        const teamType = interaction.options.getString('equipe');
        const action = interaction.options.getString('action');
        const membre = interaction.options.getUser('membre');
        const nom = interaction.options.getString('nom');
        const max = interaction.options.getString('max');

        const teamName = teamType === 'tryhard' ? 'Tryhard 🔥' : 'Fun 🎉';

        // Vérifications des paramètres
        if ((action === 'add' || action === 'remove') && !membre) {
            return interaction.reply({
                content: '❌ Tu dois mentionner un membre pour cette action.',
                ephemeral: true
            });
        }

        if (action === 'edit' && !nom) {
            return interaction.reply({
                content: '❌ Tu dois spécifier un nom pour cette action.',
                ephemeral: true
            });
        }

        if (action === 'update' && !max) {
            return interaction.reply({
                content: '❌ Tu dois spécifier un nombre max pour cette action.',
                ephemeral: true
            });
        }

        // Actions
        if (action === 'add') {
            const memberIds = data[teamType].members.map(m => m.id);

            if (memberIds.includes(membre.id)) {
                return interaction.reply({
                    content: `❌ ${membre} est déjà dans l'équipe ${teamName}.`,
                    ephemeral: true
                });
            }

            const maxMembers = parseInt(data[teamType].maxMembers);
            if (!isNaN(maxMembers) && data[teamType].members.length >= maxMembers) {
                return interaction.reply({
                    content: `❌ L'équipe ${teamName} est déjà complète (${maxMembers}/${maxMembers} membres).`,
                    ephemeral: true
                });
            }

            // Récupérer le membre du serveur pour avoir le displayName
            const guildMember = await interaction.guild.members.fetch(membre.id);

            // Ajouter le rôle
            const roleId = teamType === 'tryhard' ? ROLE_TRYHARD_ID : ROLE_FUN_ID;
            if (roleId) {
                try {
                    await guildMember.roles.add(roleId);
                } catch (err) {
                    console.error(`Erreur ajout rôle: ${err}`);
                }
            }

            data[teamType].members.push({
                id: membre.id,
                name: guildMember.displayName
            });
            saveData(data);

            await updateTeamMessage(teamType);
            return interaction.reply({
                content: `✅ ${membre} a été ajouté à l'équipe ${teamName} !`,
                ephemeral: true
            });
        }

        if (action === 'remove') {
            const memberIds = data[teamType].members.map(m => m.id);

            if (!memberIds.includes(membre.id)) {
                return interaction.reply({
                    content: `❌ ${membre} n'est pas dans l'équipe ${teamName}.`,
                    ephemeral: true
                });
            }

            // Retirer le rôle
            const roleId = teamType === 'tryhard' ? ROLE_TRYHARD_ID : ROLE_FUN_ID;
            if (roleId) {
                try {
                    const guildMember = await interaction.guild.members.fetch(membre.id);
                    await guildMember.roles.remove(roleId);
                } catch (err) {
                    console.error(`Erreur retrait rôle: ${err}`);
                }
            }

            data[teamType].members = data[teamType].members.filter(m => m.id !== membre.id);
            saveData(data);

            await updateTeamMessage(teamType);
            return interaction.reply({
                content: `✅ ${membre} a été retiré de l'équipe ${teamName}.`,
                ephemeral: true
            });
        }

        if (action === 'edit') {
            data[teamType].name = nom;
            saveData(data);

            await updateTeamMessage(teamType);
            return interaction.reply({
                content: `✅ L'équipe ${teamName} a été renommée en **${nom}**.`,
                ephemeral: true
            });
        }

        if (action === 'update') {
            data[teamType].maxMembers = max;
            saveData(data);

            await updateTeamMessage(teamType);
            return interaction.reply({
                content: `✅ Le nombre max de membres de ${teamName} est maintenant **${max}**.`,
                ephemeral: true
            });
        }
    }

    // Commande /init
    if (commandName === 'init') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: '❌ Seul le propriétaire peut utiliser cette commande.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const successTryhard = await updateTeamMessage('tryhard');
        const successFun = await updateTeamMessage('fun');

        if (successTryhard && successFun) {
            return interaction.followUp({
                content: '✅ Messages initialisés dans les deux salons !',
                ephemeral: true
            });
        } else {
            return interaction.followUp({
                content: '⚠️ Erreur lors de l\'initialisation. Vérifie les IDs des salons.',
                ephemeral: true
            });
        }
    }

    // Commande /liste
    if (commandName === 'liste') {
        const embeds = loadEmbeds();
        const color = parseInt(embeds.color.replace('#', ''), 16);

        const embed = new EmbedBuilder()
            .setTitle(embeds.liste.title)
            .setColor(color);

        for (const teamType of ['tryhard', 'fun']) {
            const team = data[teamType];
            const config = embeds[teamType];

            let membersList;
            if (team.members.length > 0) {
                membersList = team.members.map(m => `• <@${m.id}>`).join('\n');
            } else {
                membersList = config.noMembers;
            }

            const title = config.title.replace('{name}', team.name);
            const footer = config.footerText
                .replace('{count}', team.members.length)
                .replace('{max}', team.maxMembers || 'XX');

            embed.addFields({
                name: `${title} (${footer})`,
                value: membersList,
                inline: true
            });
        }

        return interaction.reply({ embeds: [embed] });
    }
});

// Lancement du bot
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN non défini dans .env');
    process.exit(1);
}

client.login(TOKEN);
