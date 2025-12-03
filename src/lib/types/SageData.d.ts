import { ActivityType } from 'discord.js';

export interface SageData {
	status: {
		type: keyof typeof ActivityType;
		content: string
		name: string;
	};
	commandSettings: Array<{ name: string, enabled: boolean }>;
}
