import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

export class PagifiedSelectMenu {

	menus: StringSelectMenuBuilder[];
	numOptions: number;
	numPages: number;
	currentPage: number;

	constructor() {
		this.menus = [];
		this.numOptions = 0;
		this.numPages = 0;
		this.currentPage = 0;
	}

	createSelectMenu(customId: string, placeHolder: string, minimumValues: number): void {
		const newMenu = new StringSelectMenuBuilder()
			.setCustomId(customId)
			.setPlaceholder(placeHolder)
			.setMinValues(minimumValues);
		this.menus.push(newMenu);
		this.numPages++;
	}

	addOption(label: string, description: string, value: string): void {
		if (this.menus.length > 0) {
			const lastMenu = this.menus[this.menus.length - 1];
			lastMenu.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel(label)
					.setDescription(description)
					.setValue(value)
			);
			this.numOptions++;
			if ((this.numOptions + 1) % 26 === 0) {
				this.createSelectMenu(lastMenu.data.custom_id, lastMenu.data.placeholder, lastMenu.data.min_values);
			}
		}
	}

}
