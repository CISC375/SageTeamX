import {
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ApplicationCommandOptionData,
    ApplicationCommandOptionType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ComponentType,
    EmbedBuilder,
    Message,
	TextInputStyle,
	TextInputBuilder,
	ModalBuilder,
	GuildMember
} from 'discord.js';
import { Command } from '@root/src/lib/types/Command';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { retrieveEvents } from '@root/src/lib/auth';
import { ROLES } from '@root/config';
const MONGO_URI = process.env.DB_CONN_STRING ?? '';
// console.log("Loaded Mongo URI:", MONGO_URI);
const DB_NAME = 'MentorsDatabase';
const COLLECTION_NAME = 'mentors';
export default class MentorInfoCollection extends Command {
    public name = 'mentorinfo';
    public description = 'Adds information to a mentor info sheet. (mentor role required)';
    public options: ApplicationCommandOptionData[] = [
        {
            type: ApplicationCommandOptionType.String,
            name: 'mentorname',
            description: 'Enter your first and last name',
            required: true
        }
    ];


    public async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // 1️⃣ Defer the reply so we can use editReply later
        await interaction.deferReply({ ephemeral: true });
        // 2️⃣ Get & trim inputs
        const mentorNameRaw = interaction.options.getString('mentorname', true);
        const mentorName = mentorNameRaw.toUpperCase().trim();

        // 3️⃣ connect to MongoDB
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        const col = client.db(DB_NAME).collection(COLLECTION_NAME);
        // 4️⃣ check if mentor already exists in the database and creates one if none are found
        let mentorDoc = await col.findOne({ mentorName });

        if (!mentorDoc) {
            mentorDoc = {
                mentorName,
				user_ID: interaction.user.id,
                first_name: "",
                last_name: "",
                year: "",
                portfolio: "",
                cisc_cores_taken: [],
                cisc_electives_taken: [],
                favorite_classes: [],
                resume: "",
                extracurriculars: [],
                contact_info: ""
            };
            await col.insertOne(mentorDoc);
			await client.close();
        }

		// 5️⃣ Permission check (please note this must happen after the user enters which mentor they would like to choose at least until a mentor role is added)
		const member = interaction.member as GuildMember;
		//add the other roles desired in the future to this constant
		const MODERATOR_ROLE_IDS = [ROLES.ADMIN, ROLES.STAFF];
		const isModerator = member?.roles?.cache.some(role => MODERATOR_ROLE_IDS.includes(role.id));
		if (mentorDoc.user_ID != interaction.user.id && isModerator) {
            await interaction.followUp({
				content: `❌ You do not have permission to edit ${mentorDoc.first_name}'s mentor profile. Please re-enter the name you used to register your mentor profile.`,
				ephemeral: true
            });
            return;
		}


        // 5️⃣ create dropdown menu
        //creates a dropdown menu constant that will contain all the dropdown info and their references.
        //May need to be more specific with variable name in the future
		//it is important to note that even when infoEmbed is called later it doesn't update due to the mongoDB conneciton having been closed and mentorDoc being static
		const infoEmbed = new EmbedBuilder()
			.setTitle(`Mentor Information: ${mentorNameRaw}`)
			.setDescription(
				`**First Name:** ${mentorDoc.first_name || 'Not set'}
				**Last Name:** ${mentorDoc.last_name || 'Not set'}
				**Year:** ${mentorDoc.year || 'Not set'}
				**Portfolio Link:** ${mentorDoc.portfolio || 'Not set'}
				**CISC Core Classes Taken:** ${mentorDoc.cisc_cores_taken.join(', ') || 'Not set'}
				**CISC Elective Classes Taken:** ${mentorDoc.cisc_electives_taken.join(', ') || 'Not set'}
				**Favorite UD Classes:** ${mentorDoc.favorite_classes.join(', ') || 'Not set'}
				**Link to Resume:** ${mentorDoc.resume || 'Not set'}
				**Past/Present Extracurriculars:** ${mentorDoc.extracurriculars.join(', ') || 'Not set'}
				**Contact Info:** ${mentorDoc.contact_info || 'Not set'}`
			)
        const dropdown = new StringSelectMenuBuilder()
            .setCustomId('mentor_info_dropdown')
            .setPlaceholder(`Edit info for ${mentorNameRaw}`)
            .addOptions([
                new StringSelectMenuOptionBuilder().setLabel('First Name').setValue('first_name'),
                new StringSelectMenuOptionBuilder().setLabel('Last Name').setValue('last_name'),
                new StringSelectMenuOptionBuilder().setLabel('Year').setValue('year'),
                new StringSelectMenuOptionBuilder().setLabel('Portfolio Link').setValue('portfolio'),
                new StringSelectMenuOptionBuilder().setLabel('CISC Core Classes Taken').setValue('cisc_core_taken'),
                new StringSelectMenuOptionBuilder().setLabel('CISC Elective Classes Taken').setValue('cisc_electives_taken'),
                new StringSelectMenuOptionBuilder().setLabel('Favorite UD Classes').setValue('fav_classes'),
                new StringSelectMenuOptionBuilder().setLabel('Link to Resume').setValue('resume'),
                new StringSelectMenuOptionBuilder().setLabel('Past/Present Extracurriculars').setValue('extracurriculars'),
                new StringSelectMenuOptionBuilder().setLabel('Contact Info').setValue('contact_info'),
            ]);

		//PLEASE NOTE: the lines 124-144 are an attempt to limit the number of characters read by embedInfo (Modal crashes at or more than 45 characters)
		// Max length to display in embed
		const displayMax = 45;

		// Create a copy of mentorDoc for display purposes
		const displayDoc: Record<string, any> = {};

		// Loop over each key in mentorDoc
		Object.keys(mentorDoc).forEach(key => {
			const value = mentorDoc[key];

			if (typeof value === 'string') {
				// Truncate long strings
				displayDoc[key] = value.length > displayMax ? value.slice(0, displayMax) + '…' : value;
			} else if (Array.isArray(value)) {
				// Join arrays into a string, then truncate if too long
				const joined = value.join(', ');
				displayDoc[key] = joined.length > displayMax ? joined.slice(0, displayMax) + '…' : joined;
			} else {
				// Keep other types as-is
				displayDoc[key] = value;
			}
		});
        //create the constant "row" that will hold the conversion to selection within interactions
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(dropdown);
       
        //command prompt through bot
        await interaction.followUp({
            content: `Hello **${mentorNameRaw}**! please select an option from the list below to edit:`,
			embeds: [infoEmbed],
            components: [row],
            ephemeral: true
        });


        //hotfix to contradict replies
        interaction.replied = true;
        //info collector for dropdown
        const dropCollector = interaction.channel?.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000
        });

		// 6️⃣ collect the info from the dropdown menu and edit the Mentor Information in MongoDB
		dropCollector?.on('collect', async i => {
			if (i.customId != 'mentor_info_dropdown') {return;}
			const field = i.values[0];
			await client.connect();
			let refreshed = await col.findOne({mentorName});
			await client.close();
			const oldValue = refreshed?.[field]  ?? "";

			// creation of the user forward textbox for entering in new information to be sent later.
			const modal = new ModalBuilder()
				.setCustomId(`mentor_modal_${field}`)
				.setTitle(`Edit ${field.replace(/_/g, " ")}`);
			//PLEASE NOTE: the lines 179-182,212-216 are an attempt to limit the number of characters read by embedInfo (Modal crashes at or more than 45 characters)
			const maxLabelLength = 45;
			const truncatedOldValue = oldValue.length > maxLabelLength
				? oldValue.slice(0, maxLabelLength - 1) + '…'
				: oldValue;

			const textInput = new TextInputBuilder()
				.setCustomId('new_value')
				.setLabel(`Current: ${truncatedOldValue || "N/A"}`) // safely truncated
				.setPlaceholder('Enter new value:')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true);
			const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
			modal.addComponents(modalRow);
			//sending it to user
			try {
				await i.showModal(modal); // this responds to the interaction
			} catch (err) {
				console.error('Failed to show modal:', err);
				return;
			}

			const submitted = await i.awaitModalSubmit({
				time: 180_000,
				filter: (m) => m.customId === `mentor_modal_${field}` && m.user.id === interaction.user.id
			}).catch(() => null);

			if (!submitted) {
				return i.followUp({
					content: "Timed out. You took to long to answer. Try answering again!",
					ephemeral: true
				});
			}

			const newValue = submitted.fields.getTextInputValue("new_value");
			let warningMessage = '';
			if (newValue.length > maxLabelLength) {
				warningMessage = `⚠️ The input is longer than ${maxLabelLength} characters. This may be truncated in some displays.`;
			}
			await col.updateOne(
				{ mentorName },
				{ $set: { [field]: newValue } }
			);

			await client.connect();
			refreshed = await col.findOne({mentorName});
			await client.close();

			const updatedInfoEmbed = new EmbedBuilder()
			.setTitle(`Mentor Information: ${mentorNameRaw}`)
			.setDescription(
				`**First Name:** ${refreshed.first_name || 'Not set'}
				**Last Name:** ${refreshed.last_name || 'Not set'}
				**Year:** ${refreshed.year || 'Not set'}
				**Portfolio Link:** ${refreshed.portfolio || 'Not set'}
				**CISC Core Classes Taken:** ${refreshed.cisc_cores_taken.join(', ') || 'Not set'}
				**CISC Elective Classes Taken:** ${refreshed.cisc_electives_taken.join(', ') || 'Not set'}
				**Favorite UD Classes:** ${refreshed.favorite_classes.join(', ') || 'Not set'}
				**Link to Resume:** ${refreshed.resume || 'Not set'}
				**Past/Present Extracurriculars:** ${refreshed.extracurriculars.join(', ') || 'Not set'}
				**Contact Info:** ${refreshed.contact_info || 'Not set'}`
			)
			await submitted.update({
				embeds: [updatedInfoEmbed],
				content: `✅ **${field.replace(/_/g, " ").toUpperCase()}** updated successfully!\nNew value:\n\`\`\`${newValue}\`\`\``,
				components: [row]
			});
		})
    }
}

