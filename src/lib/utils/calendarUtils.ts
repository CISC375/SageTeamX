import
{ ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	CacheType,
	ChatInputCommandInteraction,
	ComponentType,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	StringSelectMenuOptionBuilder } from 'discord.js';

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

	/**
	 * Adds an option to an available select menu. If all select menus are full, it will create a new select menu
	 *
	 * @param {Object} options Contains the values that will be used to cretae the select menu option
	 * @param {string} options.label The label that will be given to the select menu option
	 * @param {string} options.value The value that will be assigned to the select menu option
	 * @param {string} options.description Optional: Description that will appear under the select menu option
	 * @returns {void} This method returns nothing
	 */
	addOption(options: { label: string, value: string, description?: string }): void {
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

	/**
	 * Generates Discord action rows containing the string select menu and navigation buttons
	 *
	 * @returns {(ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[]} An array of action rows containing the string select menu and navigation buttons
	 */
	generateActionRows(): (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] {
		const rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];
		const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(this.menus[this.currentPage]);
		rows.push(menuRow);

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
			rows.push(pageButtons);
		}
		return rows;
	}

	/**
	 * Generates an ephemeral message containing a select menu and navigation buttons if the select menu has more than 25 values. Handles collector logic using the passed in function
	 *
	 * @param {function(StringSelectMenuInteraction<CacheType>): void} collectorLogic Contains the logic for the message collector
	 * @param {ChatInputCommandInteraction} interaction The Discord interaction created by the called command
	 * @param {(ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[]} rows The action rows that contains the select menu and navigation buttons
	 */
	async generateMessage(
		collectorLogic: (i: StringSelectMenuInteraction<CacheType>) => void,
		interaction: ChatInputCommandInteraction,
		rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[]
	): Promise<void> {
		const reply = await interaction.followUp({ components: rows, ephemeral: true });
		const collector = reply.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000
		});

		collector.on('collect', async (i) => {
			collectorLogic(i);
		});
	}

}
