import { ChatInputCommandInteraction, InteractionResponse, EmbedBuilder } from 'discord.js';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = `Who doesnt love gambling, heres a slot machine.`;

	//slots symbols, get more worth, 6 symbols
	private symbols = [
		{ emoji: '🍒', prize: 5, weight: 10 }, // common
		{ emoji: '🍊', prize: 5, weight: 10 },
		{ emoji: '🍇', prize: 10, weight: 8 },
		{ emoji: '🔔', prize: 20, weight: 6 },
		{ emoji: '💎', prize: 50, weight: 3 },
		{ emoji: '💰', prize: 100, weight: 1 } // rare
	];

	// array to generate the weighted outcomes, look to Stack overflow: https://stackoverflow.com/questions/51345563/random-numbers-with-weights-in-an-array (FOR JAVA,CONVERTED FOR TS COMMAND)
	private weightedReel = this.symbols.flatMap(s => Array(s.weight).fill(s.emoji));

	private spin(): string {
		return this.weightedReel[Math.floor(Math.random() * this.weightedReel.length)];
	}

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const reel1 = this.spin();
		const reel2 = this.spin();
		const reel3 = this.spin();

		const resultEmbed = new EmbedBuilder()
			.setColor('Gold')
			.setTitle('Slot Machine')
			.setDescription(`**[ ${reel1} | ${reel2} | ${reel3} ]**`);

		// Check for a win
		if (reel1 === reel2 && reel2 === reel3) {
			const winningSymbol = this.symbols.find(s => s.emoji === reel1);
			const prize = winningSymbol?.prize || 0;

			if (winningSymbol?.emoji === '💰') {
				resultEmbed.addFields({ name: 'JACKPOT!', value: `WOW! You hit the jackpot and won ${prize} coins!` });
			} else {
				resultEmbed.addFields({ name: 'Winner!', value: `You won ${prize} coins!` });
			}
		} else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
			// Smaller prize for two matching symbols
			const matchingSymbol = this.symbols.find(s => s.emoji === (reel1 === reel2 ? reel1 : reel3));
			const prize = Math.ceil((matchingSymbol?.prize || 0) / 4); // Win 1/4 of the prize for two

			if (prize > 0) {
				resultEmbed.addFields({ name: 'Nice!', value: `You got two matching symbols and won ${prize} coins!` });
			} else {
				resultEmbed.addFields({ name: 'So close!', value: 'Try again!' });
			}
		} else {
			resultEmbed.addFields({ name: 'Better luck next time!', value: 'No win this time.' });
		}

		return interaction.reply({ embeds: [resultEmbed] });
	}

}
