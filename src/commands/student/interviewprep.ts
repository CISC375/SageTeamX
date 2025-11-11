import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { generateErrorEmbed } from '@root/src/lib/utils/generalUtils';
import fs from 'fs';
import path from 'path';

interface InterviewQuestion {
	category: string;
	question: string;
}

/**
 * A command to provide students with a random technical interview question.
 * It can optionally filter by a specific category.
 */
export default class extends Command {

	description = `Get a random technical interview question to practice.`;
	extendedHelp = `You can use the 'category' option to get a question from a specific topic.`;

	// Define the command options (e.g., the category filter)
	options: ApplicationCommandOptionData[] = [
		{
			name: 'category',
			description: 'The category to get a question from.',
			type: ApplicationCommandOptionType.String,
			required: false,
			// We can pre-define the choices for the user
			choices: [
				{ name: 'Data Structures', value: 'Data Structures' },
				{ name: 'Algorithms', value: 'Algorithms' },
				{ name: 'Java', value: 'Java' },
				{ name: 'Python', value: 'Python' },
				{ name: 'General Concepts', value: 'General Concepts' }
			]
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		try {
			// Load the Questions
			// Construct the path to the JSON file in the assets folder
			const jsonPath = path.join(__dirname, '../../../../assets/json/interview_questions.json');
			// Read the file's content
			const questionsJson = fs.readFileSync(jsonPath, 'utf8');
			// Parse the JSON text into an array of objects
			const questions: InterviewQuestion[] = JSON.parse(questionsJson);

			// Filter by Category (if provided)
			const category = interaction.options.getString('category');
			let filteredQuestions = questions;
			if (category) {
				// If a category was chosen, filter the array
				filteredQuestions = questions.filter(question => question.category === category);
			}

			// Pick a Random Question
			if (filteredQuestions.length === 0) {
				// This should only happen if the category is valid but has no questions
				return interaction.reply({
					embeds: [generateErrorEmbed(`Sorry, I don't have any questions for the category: **${category}**`)],
					ephemeral: true
				});
			}

			const randomQuestion = filteredQuestions[Math.floor(Math.random() * filteredQuestions.length)];

			// Build and Send the Embed
			const responseEmbed = new EmbedBuilder()
				.setColor('DarkAqua') // A more professional color
				.setTitle(`Here is your interview question:`)
				.addFields(
					{ name: 'Category', value: randomQuestion.category, inline: true },
					{ name: 'Question', value: randomQuestion.question }
				)
				.setFooter({ text: `Use /interviewprep again to get another one!` });

			return interaction.reply({ embeds: [responseEmbed] });
		} catch (error) {
			// Catch any unexpected errors (e.g., file not found, JSON is invalid)
			console.error(`[interviewprep] Error: ${error}`);
			return interaction.reply({
				embeds: [generateErrorEmbed('Sorry, I couldn\'t fetch a question. Please try again later.')],
				ephemeral: true
			});
		}
	}

}
