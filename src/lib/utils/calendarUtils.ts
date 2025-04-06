import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

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

	/**
	 * Creates a blank select menu with no options
	 *
	 * @param {string} customId The ID of the select menu
	 * @param {string} placeHolder Text that appears on the select menu when no value has been chosen
	 * @param {string} minimumValues The minimum number values that the select menu will accept
	 * @returns {void} This method returns nothing
	*/
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
			const newOption = new StringSelectMenuOptionBuilder()
				.setLabel(options.label)
				.setValue(options.value);

			// Check for optional parameters
			if (options.description) {
				newOption.setDescription(options.description);
			}

			// Add option into menu
			lastMenu.addOptions(newOption);
		}
	}

	generateActionRows(): (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] {
		const components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];
		const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(this.menus[this.currentPage]);
		components.push(menuRow);

		if (this.menus.length > 1) {
			const nextButton = new ButtonBuilder()
				.setCustomId('next_button')
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage + 1 === this.numPages);

			const prevButton = new ButtonBuilder()
				.setCustomId('prev_button')
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage === 0);

			const pageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
			components.push(pageButtons);
		}
		return components;
	}

}
