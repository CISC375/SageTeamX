import
{ ActionRowBuilder,
	APISelectMenuOption,
	ButtonBuilder,
	ButtonStyle,
	CacheType,
	ChatInputCommandInteraction,
	ComponentType,
	InteractionResponse,
	Message,
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
	 * @param {Object} options Contains the values that will be used to cretae the select menu
	 * @param {string} options.customId The ID of the select menu
	 * @param {string} options.placeHolder Optional: Text that appears on the select menu when no value has been chosen
	 * @param {number} options.minimumValues Optional: The minimum number values that must be selected
	 * @param {number} options.maximumValues Optional: The maximum number values that the select menu will accept
	 * @param {boolean} options.disabled Optional: Whether this select menu is disabled
	 * @param {APISelectMenuOption[]} option.options Optional: Sets the options for the select menu
	 * @returns {void} This method returns nothing
	*/
	createSelectMenu(options: {customId: string, placeHolder?: string, minimumValues?: number, maximumValues?: number, disabled?: boolean, options?: APISelectMenuOption[]}): void {
		// Creates inital select menu
		const newMenu = new StringSelectMenuBuilder()
			.setCustomId(options.customId);

		// Check for optional parameters
		if (options.placeHolder !== undefined) {
			newMenu.setPlaceholder(options.placeHolder);
		}
		if (options.minimumValues !== undefined) {
			newMenu.setMinValues(options.minimumValues);
		}
		if (options.maximumValues !== undefined) {
			newMenu.setMaxValues(options.maximumValues);
		}
		if (options.disabled !== undefined) {
			newMenu.setDisabled(options.disabled);
		}
		if (options.options !== undefined) {
			newMenu.setOptions(options.options);
		}

		// Add menu to the list of menus
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
	 * @param {boolean} options.default Optional: Whether this option is selected by default
	 * @param {string} options.emoji Optional: The emoji to use
	 * @returns {void} This method returns nothing
	 */
	addOption(options: {label: string, value: string, description?: string, default?: boolean, emoji?: string}): void {
		if (this.menus.length > 0) {
			this.numOptions++;

			// Create a new menu every 26th value
			if (this.menus[this.menus.length - 1].options.length >= 25) {
				const temp = this.menus[0].data;
				this.createSelectMenu(
					{ customId: temp.custom_id,
						placeHolder: temp.placeholder,
						minimumValues: temp.min_values,
						maximumValues: temp.max_values,
						disabled: temp.disabled,
						options: temp.options }
				);
			}

			// Create inital menu option
			const lastMenu = this.menus[this.menus.length - 1];
			const newOption = new StringSelectMenuOptionBuilder()
				.setLabel(options.label)
				.setValue(options.value);

			// Check for optional parameters
			if (options.description !== undefined) {
				newOption.setDescription(options.description);
			}
			if (options.default !== undefined) {
				newOption.setDefault(options.default);
			}
			if (options.emoji !== undefined) {
				newOption.setEmoji(options.emoji);
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

		// Create action row for select menu and push it to rows array
		const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(this.menus[this.currentPage]);
		rows.push(menuRow);

		if (this.menus.length > 1) {
			// Create next and previous buttons
			const nextButton = new ButtonBuilder()
				.setCustomId(`next_button:${this.menus[0].data.custom_id}`)
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage + 1 === this.numPages);

			const prevButton = new ButtonBuilder()
				.setCustomId(`prev_button:${this.menus[0].data.custom_id}`)
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage === 0);

			// Create action frow for buttons and push it to rows array
			const pageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
			rows.push(pageButtons);
		}
		return rows;
	}

	/**
	 * Generates an ephemeral message containing a select menu and navigation buttons if the select menu has more than 25 values. Handles collector logic using the passed in function
	 *
	 * @param {function(StringSelectMenuInteraction<CacheType>): void} collectorLogic Function containing the logic for the message collector
	 * @param {ChatInputCommandInteraction} interaction The Discord interaction created by the called command
	 * @param {(ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[]} rows The action rows that contains the select menu and navigation buttons
	 */
	async generateMessage(
		collectorLogic: (i: StringSelectMenuInteraction<CacheType>) => void,
		interaction: ChatInputCommandInteraction,
		rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[]
	): Promise<void> {
		let reply: Message<boolean> | InteractionResponse<boolean>;

		// Check if the interaction has already been replied to and send the message accordingly
		if (interaction.replied) {
			reply = await interaction.followUp({ components: rows, ephemeral: true });
		} else {
			reply = await interaction.reply({ components: rows, ephemeral: true });
		}

		// Create menu collector
		const menuCollector = reply.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000
		});

		menuCollector.on('collect', async (i) => {
			collectorLogic(i);
		});

		// Checks to see if there is more than 1 menu and creates button collector for navigations buttons if there is
		if (this.menus.length > 1) {
			const buttonCollector = reply.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 60_000
			});

			buttonCollector.on('collect', async (i) => {
				if (i.customId === 'next_button') {
					await i.deferUpdate();
					this.currentPage++;
					const newRows = this.generateActionRows();
					i.editReply({ components: newRows });
				} else if (i.customId === 'prev_button') {
					await i.deferUpdate();
					this.currentPage--;
					const newRows = this.generateActionRows();
					i.editReply({ components: newRows });
				}
			});
		}
	}

	/**
	 * Generates Discord action rows containing the string select menu and navigation buttons and
	 * generates an ephemeral message containing a select menu and navigation buttons if the select menu has more than 25 values. Handles collector logic using the passed in function
	 *
	 * @param {function(StringSelectMenuInteraction<CacheType>): void} collectorLogic Contains the logic for the message collector
	 * @param {ChatInputCommandInteraction} interaction The Discord interaction created by the called command
	 */
	async createAndSendMenu(collectorLogic: (i: StringSelectMenuInteraction<CacheType>) => void, interaction: ChatInputCommandInteraction): Promise<void> {
		await this.generateMessage(collectorLogic, interaction, this.generateActionRows());
	}

}
