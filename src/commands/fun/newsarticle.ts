/**
 Searches for news articles related to given topic
 API documentation for future changes: https://www.thenewsapi.com/documentation
 */
// eslint-disable-next-line max-len
import { ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, ApplicationCommandOptionType, ApplicationCommandOptionData, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '@lib/types/Command';
import axios from 'axios';
import 'dotenv/config';

// interface needs to match newsapi json
interface NewsArticle {
	title: string;
	url: string;
	description?: string;
	snippet?: string;
	// eslint-disable-next-line camelcase
	image_url?: string;
	source: string;
	// eslint-disable-next-line camelcase
	published_at: string;
}


export default class extends Command {

	description = 'Search for news articles on a specific topic';

	options: ApplicationCommandOptionData[] = [
		{
			name: 'query',
			description: 'What do you want to search for?',
			type: ApplicationCommandOptionType.String,
			required: true
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | Message | void> {
		await interaction.deferReply();

		const query = interaction.options.getString('query');
		const language = 'en';
		const apiKey = process.env.NEWSAPIKEY;
		try {
			const response = await axios.get(`https://api.thenewsapi.com/v1/news/all`, {
				params: {
					// eslint-disable-next-line camelcase
					api_token: apiKey,
					search: query,
					language: language,
					limit: 5
				}
			});

			const articles = response.data.data;

			if (!articles || articles.length === 0) {
				return await interaction.editReply({
					content: `No articles found for "${query}"`
				});
			}

			// embeds for each article
			const embeds = articles.slice(0, 5).map((article: NewsArticle, index: number) => new EmbedBuilder()
				.setColor('Blue')
				.setTitle(article.title || 'No Title')
				.setURL(article.url)
				.setDescription(article.description || article.snippet || 'No description available')
				.setImage(article.image_url || null)
				.addFields(
					{ name: 'Source', value: article.source || 'Unknown', inline: true },
					{ name: 'Published', value: new Date(article.published_at).toLocaleDateString(), inline: true }
				)
				.setFooter({ text: `Article ${index + 1} of ${articles.length}` }));

			// navigation buttons
			let currentPage = 0;

			const createButtons = (page: number, total: number) => {
				const row = new ActionRowBuilder<ButtonBuilder>();

				row.addComponents(
					new ButtonBuilder()
						.setCustomId('newsPrev')
						.setLabel('Previous')
						.setStyle(ButtonStyle.Primary)
						.setDisabled(page === 0),
					new ButtonBuilder()
						.setCustomId('newsNext')
						.setLabel('Next')
						.setStyle(ButtonStyle.Primary)
						.setDisabled(page === total - 1),
					new ButtonBuilder()
						.setLabel('Read Article')
						.setStyle(ButtonStyle.Link)
						.setURL(articles[page].url)
				);

				return row;
			};

			const message = await interaction.editReply({
				embeds: [embeds[currentPage]],
				components: embeds.length > 1 ? [createButtons(currentPage, embeds.length)] : []
			}) as Message;

			// how to scroll through articles if more than 1
			if (embeds.length > 1) {
				const collector = message.createMessageComponentCollector({
					time: 300_000 // 5 minute timer
				});

				collector.on('collect', async (buttonInteraction) => {
					if (buttonInteraction.user.id !== interaction.user.id) {
						return buttonInteraction.reply({
							content: 'Only original user can use these buttons',
							ephemeral: true
						});
					}

					if (buttonInteraction.customId === 'newsPrev') {
						currentPage--;
					} else if (buttonInteraction.customId === 'newsNext') {
						currentPage++;
					}

					await buttonInteraction.update({
						embeds: [embeds[currentPage]],
						components: [createButtons(currentPage, embeds.length)]
					});
				});

				collector.on('end', () => {
					message.edit({
						components: []
					});
				});
			}
		} catch (error) {
			console.error('News API Error:', error);
			return await interaction.editReply({
				content: 'Failed to fetch news articles. Please try again later.'
			});
		}
	}

}
