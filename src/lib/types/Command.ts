import { ApplicationCommandOptionData, ApplicationCommandPermissionData, CommandInteraction, Message } from 'discord.js';


export abstract class Command {

	// members
	name: string;
	category: string;
	enabled: boolean;
	aliases?: Array<string>;
	description?: string;
	usage?: string;
	extendedHelp?: string;
	runInDM?: boolean;
	runInGuild?: boolean;
	options?: ApplicationCommandOptionData[];
	tempPermissions?: ApplicationCommandPermissionData[];

	// functions
	abstract run?(msg: Message, args?: Array<unknown>): Promise<unknown>;
	tempRun?(interaction: CommandInteraction): Promise<void>;
	permissions?(msg: Message): Promise<boolean> | boolean;
	argParser?(msg: Message, input: string): Promise<Array<unknown>> | Array<unknown>;

}
