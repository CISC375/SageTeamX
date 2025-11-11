import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { generateErrorEmbed } from '@root/src/lib/utils/generalUtils';

// An array of classic magic 8-ball responses
const MAGIC8BALL_RESPONSES = [
	'As I see it, yes.',
	'Ask again later.',
	'Better not tell you now.',
	'Cannot predict now.',
	'Concentrate and ask again.',
	'Don’t count on it.',
	'It is certain.',
	'It is decidedly so.',
	'Most likely.',
	'My reply is no.',
	'My sources say no.',
	'Outlook not so good.',
	'Outlook good.',
	'Reply hazy, try again.',
	'Signs point to yes.',
	'Very doubtful.',
	'Without a doubt.',
	'Yes.',
	'Yes – definitely.',
	'You may rely on it.'
];

/**
 * A magic 8-ball command that gives a random response to a user's question.
 */
export default class extends Command {

	description = `Ask the 8-ball a question and you shall get an answer.`;
	extendedHelp = `This command requires you to put a question mark ('?') at the end of your message.`;


	options: ApplicationCommandOptionData[] = [
		{
			name: 'question',
			description: 'The question you want to ask',
			type: ApplicationCommandOptionType.String,
			required: true
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		try {
			const question = interaction.options.getString('question');
			// Check if the question is valid (ends with a '?')
			const response = question.length !== 0 && (question[question.length - 1].endsWith('?') || question.endsWith('?!'))
				?	MAGIC8BALL_RESPONSES[Math.floor(Math.random() * MAGIC8BALL_RESPONSES.length)]
				:	'The 8-ball only responds to questions smh';
			// Create the response embed
			const responseEmbed = new EmbedBuilder()
				.setColor('#000000')
				.setTitle('The magic 8-ball says...')
				.setDescription(response)
				.setImage(`https://i.imgur.com/UFPWxHV.png`)
				.setFooter({ text: `${interaction.user.username} asked: ${question}` });
			return interaction.reply({ embeds: [responseEmbed] });
		} catch (error) {
		// Catch any unexpected errors
			console.error(`[8ball] Error: ${error}`);
			return interaction.reply({
				embeds: [generateErrorEmbed('Sorry, the 8-ball is a bit cloudy right now. Please try again later.')],
				ephemeral: true
			});
		}
	}

}
