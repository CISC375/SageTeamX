import { ApplicationCommandOptionData, ApplicationCommandOptionType, CommandInteraction, CommandInteractionOptionResolver, GuildMember, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = 'Press X to doubt.';
	options: ApplicationCommandOptionData[] = [
		{
			name: 'target',
			description: 'The user to doubt',
			type: ApplicationCommandOptionType.User,
			required: true
		}
	]

	run(interaction: CommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const target = (interaction.options as CommandInteractionOptionResolver).getMember('target') as GuildMember;
		return interaction.reply({ files: [{
			attachment: `${__dirname}../../../../../assets/images/doubt.jpg`,
			name: 'doubt.jpg'
		}], content: `${interaction.user.username} pressed X to doubt ${target.user.username}` });
	}

}
