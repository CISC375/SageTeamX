import { BOT } from '@root/config';
import { Command } from '@lib/types/Command';
import { SageInteractionType } from '@lib/types/InteractionType';
import { buildCustomId, getDataFromCustomId } from '@lib/utils/interactionUtils';
import {ActionRowBuilder,ButtonBuilder,ButtonInteraction,ButtonStyle,ChatInputCommandInteraction,ComponentType,
} from 'discord.js';

export default class extends Command {
	description = `Can you beat ${BOT.NAME} in a game of Tic-Tac-Toe?`;

	name = 'tictactoe';

	async run(interaction: ChatInputCommandInteraction) {
		const board = Array(9).fill(null); // empty 3x3 board
		const playerSymbol = '❌';
		const botSymbol = '⭕';

		const renderBoard = () => {
			const rows = [];
			for (let i = 0; i < 3; i++) {
				const row = new ActionRowBuilder<ButtonBuilder>();
				for (let j = 0; j < 3; j++) {
					const index = i * 3 + j;
					const mark = board[index];
					row.addComponents(
						new ButtonBuilder()
							.setCustomId(buildCustomId('tictactoe', { index }))
							.setLabel(mark ?? ' ')
							.setStyle(mark === playerSymbol ? ButtonStyle.Primary :
								mark === botSymbol ? ButtonStyle.Danger :
								ButtonStyle.Secondary)
							.setDisabled(mark !== null)
					);
				}
				rows.push(row);
			}
			return rows;
		};

		await interaction.reply({
			content: `🎮 **Tic-Tac-Toe vs ${BOT.NAME}**\nYou're ${playerSymbol}!`,
			components: renderBoard(),
		});

		const message = await interaction.fetchReply();

		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 60_000, // 1 minute timeout
		});

		const checkWinner = (symbol: string) => {
			const wins = [
				[0, 1, 2],
				[3, 4, 5],
				[6, 7, 8],
				[0, 3, 6],
				[1, 4, 7],
				[2, 5, 8],
				[0, 4, 8],
				[2, 4, 6],
			];
			return wins.some(combo => combo.every(i => board[i] === symbol));
		};

		collector.on('collect', async (btn: ButtonInteraction) => {
			const { index } = getDataFromCustomId(btn.customId);
			if (board[index]) return btn.reply({ content: 'That spot is taken!', ephemeral: true });

			board[index] = playerSymbol;

			if (checkWinner(playerSymbol)) {
				await btn.update({
					content: `🎉 You win!`,
					components: renderBoard(),
				});
				collector.stop();
				return;
			}

			if (!board.includes(null)) {
				await btn.update({
					content: `😐 It's a draw!`,
					components: renderBoard(),
				});
				collector.stop();
				return;
			}

			// Bot move
			const empty = board.map((v, i) => (v ? null : i)).filter(v => v !== null);
			const botMove = empty[Math.floor(Math.random() * empty.length)] as number;
			board[botMove] = botSymbol;

			let status = `Your move, ${btn.user.username}!`;
			if (checkWinner(botSymbol)) {
				status = `💀 ${BOT.NAME} wins!`;
				collector.stop();
			} else if (!board.includes(null)) {
				status = `😐 It's a draw!`;
				collector.stop();
			}

			await btn.update({
				content: status,
				components: renderBoard(),
			});
		});

		collector.on('end', async () => {
			await interaction.editReply({
				content: `Game over!`,
				components: renderBoard().map(row => {
					row.components.forEach(button => button.setDisabled(true));
					return row;
				}),
			});
		});
	}
}
