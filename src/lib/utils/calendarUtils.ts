import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

export class PagifiedSelectMenu {

	menus: StringSelectMenuBuilder[];
	private numOptions: number;
	private numPages: number;
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

	addOption(options: { label: string, description?: string, value: string }): void {
		if (this.menus.length > 0) {
			this.numOptions++;

			// Create a new menu every 26th value
			if (this.numOptions % 26 === 0) {
				this.createSelectMenu(this.menus[0].data.custom_id, this.menus[0].data.placeholder, this.menus[0].data.min_values);
			}

			// Create inital menu option
			const lastMenu = this.menus[this.menus.length - 1];
			const newOption = new StringSelectMenuOptionBuilder();


			// Check for option parameters
			if (options.description) {
				newOption.setDescription(options.description);
			}

			// Add option into menu
			lastMenu.addOptions(newOption);
		}
	}

	generateActionRows(): void {
		const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(this.menus[this.currentPage]);
	}

}
