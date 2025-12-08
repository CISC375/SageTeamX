import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, Message } from 'discord.js';
import { Command } from '@lib/types/Command';
import { generateErrorEmbed } from '@root/src/lib/utils/generalUtils';

/**
 * A command that fetches and displays a GitHub user's profile information.
 */
export default class extends Command {

	description = 'Look up a GitHub user profile.';
	extendedHelp = 'Fetches public profile data from the GitHub API.';

	options: ApplicationCommandOptionData[] = [
		{
			name: 'username',
			description: 'The GitHub username to look up',
			type: ApplicationCommandOptionType.String,
			required: true
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void | Message<boolean>> {
		// Defer reply in case the API is slow
		await interaction.deferReply();

		try {
			const username = interaction.options.getString('username');

			const response = await fetch(`https://api.github.com/users/${username}`);

			if (response.status === 404) {
				return interaction.editReply({
					embeds: [generateErrorEmbed(`I couldn't find a GitHub user named **${username}**.`)]
				});
			}

			if (!response.ok) {
				throw new Error(`GitHub API error: ${response.statusText}`);
			}

			const data = await response.json();

			// Some users don't have a bio or location set
			const bio = data.bio || 'No bio provided.';
			const location = data.location || 'Unknown';
			const company = data.company || 'None';
			const blog = data.blog ? `[Website](${data.blog})` : 'No website';

			const embed = new EmbedBuilder()
				.setTitle(`${data.login}'s GitHub Profile`)
				.setURL(data.html_url)
				.setThumbnail(data.avatar_url)
				.setColor('#2b3137') // GitHub's dark grey color
				.setDescription(bio)
				.addFields(
					{ name: '📂 Repositories', value: `${data.public_repos}`, inline: true },
					{ name: '👥 Followers', value: `${data.followers}`, inline: true },
					{ name: '👣 Following', value: `${data.following}`, inline: true },
					{ name: '📍 Location', value: location, inline: true },
					{ name: '🏢 Company', value: company, inline: true },
					{ name: '📅 Joined', value: new Date(data.created_at).toLocaleDateString(), inline: true }
				)
				.setFooter({ text: 'Data provided by GitHub API' });

			return interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error(`[github] Error: ${error}`);
			return interaction.editReply({
				embeds: [generateErrorEmbed('Sorry, I couldn\'t fetch that profile. Try again later.')]
			});
		}
	}

}
