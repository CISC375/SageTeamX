/**
 * So as it turns out, Discord is pretty limited in what it can do
 * This class was built with the goal to get around the max 25 options in a select menu
 * In short, if you build select menus using this class instead of the normal way, it will automatically create new select menus as needed.
 * It will also automatically create navigaiton buttons if the number of select menus is greater than 1
 *
 * So how to use this thing you may ask? Well I hope the JSDoc comments bellow can help, but I'll still explain it up here
 *
 * Instructions:
 * 	1. Call the constructor ( const newMenu = new PagifiedSelectMenu(); )
 * 	2. Generate the inital menu ( newMenu.createSelectMenu({customId: 'tutorial', ...other options}); )
 * 	3. Add options to your menu - Note: The addOption() method will only add ONE option at a time.
 * 		a. Create an array containing all the values you want to put into the select menu before calling this method (if you want only one option, then you don't have to do this)
 * 		b. Iterate over the array and call the addOption() method each iteration ( myValues.forEach((val) => addOption({label: val, value: val, ...other options})) )
 * 		c. Profit
 * 	4. Congratulations you just created a pagified select menu
 * 	5. Send the darn thing. You can use the generateActionRows() method to generate the components neccessary to render the menu and navigations buttons
 *  6. And then just pass the returned action rows into the components property when sending a message
 *  7. Make sure to setup collectors so that your select menu and possible navigations buttons work
 * 		a. Navigations buttons have the following custom_Ids next_button:[Custom ID of menu] prev_button:[Custom ID of menu]
 *	8. Alternativley, you can use generateMessage() to send the message and it will take care of the collector logic for you...sort of
 *		a. It will create the logic for the buttons, but you have to pass in a function containing the logic for the menu collector
 *		b. Example: newMenu.generateMessage(collectorLogic(i) => { [your code goes here] }, interaction, rows)
 *		c. Note: You MUST pass in your function with i: StringSelectMenuInteraction<CacheType> as an argument
 * 	9. You can also take care of row generation and message sending using the generateRowsAndSendMenu() method
 */

import
{ ActionRowBuilder,
	APISelectMenuOption,
	ButtonBuilder,
	ButtonStyle,
	CacheType,
	ChatInputCommandInteraction,
	ComponentType,
	DMChannel,
	InteractionResponse,
	Message,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	StringSelectMenuOptionBuilder } from 'discord.js';

export class PagifiedSelectMenu {

	menus: StringSelectMenuBuilder[]; // Array of select menus
	numOptions: number; // Total number of options across all menus
	maxSelected: number; // The max number of options a user can select
	numPages: number; // The number of menus in the menus array
	currentPage: number; // The current page number

	constructor() {
		this.menus = [];
		this.numOptions = 0;
		this.maxSelected = 1;
		this.numPages = 0;
		this.currentPage = 0;
	}

	/**
	 * Creates a blank select menu with no options
	 *
	 * @param {Object} options Contains the values that will be used to create the select menu
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
			this.maxSelected = options.maximumValues;
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
	 * @param {Object} options Contains the values that will be used to create the select menu option
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

			lastMenu.setMaxValues(this.maxSelected < lastMenu.options.length ? this.maxSelected : lastMenu.options.length);
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
	 * @param {DMChannel} dmChannel Optional: Sends messages to given DM channel
	 * @param {string} content Optional: Sets the message content
	 * @returns {Promise<Message<boolean> | InteractionResponse<boolean>>} The message sent by the bot
	 */
	async generateMessage(
		collectorLogic: (i: StringSelectMenuInteraction<CacheType>) => void,
		interaction: ChatInputCommandInteraction,
		rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[],
		dmChannel?: DMChannel,
		content?: string
	): Promise<Message<boolean> | InteractionResponse<boolean>> {
		let reply: Message<boolean> | InteractionResponse<boolean>;

		// Check if the interaction has already been replied to, or if its a DM, and send the message accordingly
		if (dmChannel) {
			reply = await dmChannel.send({ content: content, components: rows });
		} else if (interaction.replied) {
			reply = await interaction.followUp({ content: content, components: rows, ephemeral: true });
		} else {
			reply = await interaction.reply({ content: content, components: rows, ephemeral: true });
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
				if (i.customId === `next_button:${this.menus[0].data.custom_id}`) {
					await i.deferUpdate();
					this.currentPage++;
					const newRows = this.generateActionRows();
					await i.editReply({ components: newRows });
				} else if (i.customId === `prev_button:${this.menus[0].data.custom_id}`) {
					await i.deferUpdate();
					this.currentPage--;
					const newRows = this.generateActionRows();
					await i.editReply({ components: newRows });
				}
			});
		}

		return reply;
	}

	/**
	 * Generates Discord action rows containing the string select menu and navigation buttons and
	 * generates an ephemeral message containing a select menu and navigation buttons if the select menu has more than 25 values. Handles collector logic using the passed in function
	 *
	 * @param {function(StringSelectMenuInteraction<CacheType>): void} collectorLogic Contains the logic for the message collector
	 * @param {ChatInputCommandInteraction} interaction The Discord interaction created by the called command
	 * @param {DMChannel} dmChannel Optional: Sends messages to given DM channel
	 * @param {string} content Optional: Sets the message content
	 * @returns {Promise<Message<boolean> | InteractionResponse<boolean>>} The message sent by the bot
	 */
	async generateRowsAndSendMenu(
		collectorLogic: (i: StringSelectMenuInteraction<CacheType>) => void,
		interaction: ChatInputCommandInteraction,
		dmChannel?: DMChannel,
		content?: string): Promise<Message<boolean> | InteractionResponse<boolean>> {
		return await this.generateMessage(collectorLogic, interaction, this.generateActionRows(), dmChannel, content);
	}

}
