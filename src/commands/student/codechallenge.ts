import { ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, Message } from 'discord.js';
import { Command } from '@lib/types/Command';
import { generateErrorEmbed } from '@root/src/lib/utils/generalUtils';


/**
 * A command that fetches the active Daily Coding Challenge from LeetCode.
 */
export default class extends Command {

	description = 'Get the Daily LeetCode Coding Challenge.';
	extendedHelp = 'Fetches live data from LeetCode\'s GraphQL API.';

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void | Message<boolean>> {
		// Defer the reply because API calls can sometimes take a second
		await interaction.deferReply();

		try {
			// LeetCode uses GraphQL. We specifically ask for the 'questionOfToday'.
			const query = `
                query questionOfToday {
                    activeDailyCodingChallengeQuestion {
                        date
                        link
                        question {
                            title
                            titleSlug
                            difficulty
                            topicTags {
                                name
                            }
                        }
                    }
                }
            `;


			const response = await fetch('https://leetcode.com/graphql', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Referer: 'https://leetcode.com'
				},
				body: JSON.stringify({ query })
			});

			if (!response.ok) {
				throw new Error(`LeetCode API responded with status ${response.status}`);
			}

			const data = await response.json();
			const challenge = data.data.activeDailyCodingChallengeQuestion;


			const questionTitle = challenge.question.title;
			const questionDifficulty = challenge.question.difficulty;
			const questionLink = `https://leetcode.com${challenge.link}`;
			const questionDate = challenge.date;

			// Map topics to a nice string (e.g., "Array, Hash Table")
			const topics = challenge.question.topicTags.map((tag: any) => tag.name).join(', ') || 'General';

			// Pick a color based on difficulty
			let embedColor: 'Green' | 'Orange' | 'Red' = 'Green';
			if (questionDifficulty === 'Medium') embedColor = 'Orange';
			if (questionDifficulty === 'Hard') embedColor = 'Red';


			const embed = new EmbedBuilder()
				.setTitle(`LeetCode Daily Challenge: ${questionTitle}`)
				.setURL(questionLink)
				.setDescription(`**Difficulty:** ${questionDifficulty}\n**Date:** ${questionDate}\n**Topics:** ${topics}`)
				.setColor(embedColor)
				.setThumbnail('https://upload.wikimedia.org/wikipedia/commons/1/19/LeetCode_logo_black.png')
				.setFooter({ text: 'Click the title to solve it on LeetCode!' });

			// Send the embed (using editReply because we deferred earlier)
			return interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error(`[codechallenge] Error: ${error}`);
			return interaction.editReply({
				embeds: [generateErrorEmbed('Sorry, I couldn\'t fetch the daily challenge from LeetCode right now.')]
			});
		}
	}

}
