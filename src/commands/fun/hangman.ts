/**
 Hangman game command
 API used: https://random-word-api.vercel.app
 */
import { Command } from '@lib/types/Command';
// eslint-disable-next-line max-len
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, Message } from 'discord.js';
import axios from 'axios';

export default class extends Command {

	description = 'Play a game of hangman';

	options: ApplicationCommandOptionData[] = [
		{
			name: 'wordlength',
			description: 'The length of word you want to play hangman with',
			type: ApplicationCommandOptionType.Integer,
			required: true,
			minValue: 3,
			maxValue: 9
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | Message | void> {
		await interaction.deferReply();

		const length = interaction.options.getInteger('wordlength') ?? 5;
		// get random word from api
		const hangmanWord = await axios.get(`https://random-word-api.vercel.app/api?words=1&length=${length}`);
		const word: string = hangmanWord.data[0].toLowerCase();

		const unkown = '_'.repeat(length).split('');
		let guesses = 0;

		const alphabet = 'qwertyuiopasdfghjklzxcvbnm'.split('');
		// keyboard creation, includes every letter except q
		const createKeyboard = () => {
			const first = new ActionRowBuilder<ButtonBuilder>();
			const second = new ActionRowBuilder<ButtonBuilder>();
			const third = new ActionRowBuilder<ButtonBuilder>();
			const fourth = new ActionRowBuilder<ButtonBuilder>();
			const fifth = new ActionRowBuilder<ButtonBuilder>();

			'abcde'.split('').forEach(letter => {
				first.addComponents(
					new ButtonBuilder()
						.setCustomId(`guess_${letter}`)
						.setLabel(letter)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(!alphabet.includes(letter))
				);
			});

			'fghij'.split('').forEach(letter => {
				second.addComponents(
					new ButtonBuilder()
						.setCustomId(`guess_${letter}`)
						.setLabel(letter)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(!alphabet.includes(letter))
				);
			});

			'klmno'.split('').forEach(letter => {
				third.addComponents(
					new ButtonBuilder()
						.setCustomId(`guess_${letter}`)
						.setLabel(letter)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(!alphabet.includes(letter))
				);
			});

			'prstu'.split('').forEach(letter => {
				fourth.addComponents(
					new ButtonBuilder()
						.setCustomId(`guess_${letter}`)
						.setLabel(letter)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(!alphabet.includes(letter))
				);
			});

			'vwxyz'.split('').forEach(letter => {
				fifth.addComponents(
					new ButtonBuilder()
						.setCustomId(`guess_${letter}`)
						.setLabel(letter)
						.setStyle(ButtonStyle.Primary)
						.setDisabled(!alphabet.includes(letter))
				);
			});

			return [first, second, third, fourth, fifth];
		};

		const embed = new EmbedBuilder()
			.setTitle('Hangman')
			.setDescription('Sage Hangman Game')
			.setImage('https://i.imgur.com/YIvQOzb.jpeg')
			.setColor('Blue');

		const msg = await interaction.editReply({
			embeds: [embed],
			components: createKeyboard()
		}) as Message;

		const gameManager = msg.createMessageComponentCollector({
			time: 120_000
		});
		// autofill in q because keyboard doesnt have enough space for it
		for (let i = 0; i < word.length; i++) {
			if (word[i] === 'q') unkown[i] = 'q';
		}
		// game manager that controls game
		gameManager.on('collect', async interact => {
			const letter = interact.customId.split('_')[1];

			if (!alphabet.includes(letter)) {
				return interact.followUp({ content: 'Enter valid letter', ephemeral: true });
			}

			await interact.deferUpdate();

			// checks off letter
			alphabet[alphabet.indexOf(letter)] = '-';

			if (word.includes(letter)) {
				for (let i = 0; i < word.length; i++) {
					if (word[i] === letter) unkown[i] = letter;
				}
			} else {
				guesses++;
			}
			// conditions for either winnning or losing
			const done = !unkown.includes('_');
			const lost = guesses >= 6;

			const updatedEmbed = new EmbedBuilder()
				.setTitle('Hangman')
				.setDescription(`Word: \`${unkown.join(' ')}\`\nGuesses Remaining: ${6 - guesses}`)
				.setImage(hangmanImage(guesses))
				.setColor('Blue');

			if (done) {
				gameManager.stop('won');
			} else if (lost) {
				gameManager.stop('lost');
			}

			await msg.edit({
				embeds: [updatedEmbed],
				components: lost || done ? [] : createKeyboard()
			});
		});

		gameManager.on('end', (_, reason) => {
			if (reason === 'won') {
				interaction.followUp('You won!');
			} else if (reason === 'lost') {
				interaction.followUp(`You lost! The word was ${word}`);
			} else {
				interaction.followUp('Game stopped due to inactivity');
			}
		});
	}

}
// hangman images
function hangmanImage(guesses: number): string {
	if (guesses === 0) {
		return 'https://i.imgur.com/YIvQOzb.jpeg';
	} else if (guesses === 1) {
		return 'https://i.imgur.com/GXg3QxB.jpeg';
	} else if (guesses === 2) {
		return 'https://i.imgur.com/wvY0L58.jpeg';
	} else if (guesses === 3) {
		return 'https://i.imgur.com/QwzfGCA.jpeg';
	} else if (guesses === 4) {
		return 'https://i.imgur.com/kUvXaFd.jpeg';
	} else if (guesses === 5) {
		return 'https://i.imgur.com/Y9makVO.jpeg';
	} else {
		return 'https://i.imgur.com/EjE7tuL.jpeg';
	}
}
