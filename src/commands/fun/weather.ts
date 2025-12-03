/**
 Weather command that displays weather data for given area in United States
 https://api.weather.gov api for future change references
 */
import { Command } from '@lib/types/Command';
import { EMAIL } from '@root/config';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, Message } from 'discord.js';
import axios from 'axios';

export default class extends Command {

	description = 'Ask the bot for the current weather in a U.S. location via National Weather Service';

	options: ApplicationCommandOptionData[] = [
		{
			name: 'location',
			description: 'The location you want to find',
			type: ApplicationCommandOptionType.String,
			required: true
		},
		{
			name: 'hour',
			description: 'Choose which forecast period you want(0 is current forecast, 12  is latest forecast)',
			type: ApplicationCommandOptionType.Integer,
			required: true,
			minValue: 0,
			maxValue: 12
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | Message | void> {
		await interaction.deferReply();

		const location = interaction.options.getString('location', true);
		const hoursAhead = interaction.options.getInteger('hour') ?? 0;
		try {
			// use nominatim to get latitude and longititude of location
			const geoRes = await axios.get('https://nominatim.openstreetmap.org/search', {
				// have to use there paramaters for nominatim to work
				params: {
					// eslint-disable-next-line id-length
					q: location,
					format: 'json',
					limit: 1,
					countrycodes: 'us'
				},
				headers: { 'User-Agent': `SageDiscordBot ${EMAIL}` }
			});

			if (geoRes.data.length === 0) {
				await interaction.editReply(`Could not find coordinates for ${location}`);
				return;
			}

			// eslint-disable-next-line camelcase
			const { lat, lon, display_name } = geoRes.data[0];
			// eslint-disable-next-line camelcase
			const displayName = display_name;

			// use latitude and longitude gotten from nominatim to find closest weather station which will provide temperature values
			const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
			const pointsRes = await axios.get(pointsUrl, {
				headers: { 'User-Agent': `SageDiscordBot ${EMAIL}` }
			});

			const { gridId, gridX, gridY, forecast, forecastHourly } = pointsRes.data.properties;
			if (!gridId || gridX === undefined || gridY === undefined) {
				await interaction.editReply('Could not get grid data for this location');
				return;
			}

			const forecastDescription = await axios.get(forecast, {
				headers: { 'User-Agent': `SageDiscordBot ${EMAIL}` }
			});

			const forecastProperty = forecastDescription.data.properties;
			const detailedForecast = forecastProperty.periods?.[hoursAhead]?.detailedForecast ?? 'No textual forecast available at the moment';

			// weather station nearest to location provides temperature, humidity, wind and other values
			const gridRes = await axios.get(forecastHourly, {
				headers: { 'User-Agent': `SageDiscordBot ${EMAIL}` }
			});

			const rawData = gridRes.data.properties;
			const currentPeriod = rawData.periods?.[hoursAhead];
			// get values from NWS api
			const temp = currentPeriod?.temperature;
			const windSpeedString = currentPeriod?.windSpeed;
			const humidity = currentPeriod?.relativeHumidity?.value;
			const chanceOfRain = currentPeriod?.probabilityOfPrecipitation?.value;

			let windSpeedValue: number | undefined;
			if (typeof windSpeedString === 'string') {
				const match = windSpeedString.match(/(\d+)/);
				windSpeedValue = match ? parseInt(match[1]) : undefined;
			} else if (typeof windSpeedString === 'number') {
				windSpeedValue = windSpeedString;
			}

			const feelsLikeTemp = feelsLikeCalc(temp, windSpeedValue, humidity);
			const weatherEmoji = getWeatherImage(temp, chanceOfRain);
			let time = '';
			if (hoursAhead === 0) {
				time = 'currently';
			} else {
				time = `${hoursAhead} hour${hoursAhead === 1 ? '' : 's'} from now`;
			}
			// discord popup
			const embed = new EmbedBuilder()
				.setTitle(`Weather for ${displayName}`)
				.setDescription(`Forecast for next 12 hours: ${detailedForecast}`)
				.addFields(
					{ name: 'Temperature', value: `${temp} °F`, inline: true },
					{ name: 'Feels like', value: `${Math.round(feelsLikeTemp)} °F`, inline: true },
					{ name: 'Wind Speed', value: `${windSpeedValue} mph`, inline: true },
					{ name: 'Humidity', value: `${humidity}%`, inline: true },
					{ name: 'Chance of Rain', value: `${chanceOfRain}%`, inline: true }
				)
				.setFooter({ text: `Conditions ${time} from National Weather Service` })
				.setColor('Blue')
				.setImage(weatherEmoji);

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error('Error fetching NWS data:', error.response?.data || error.message);
			await interaction.editReply('Unable to fetch weather data. Try another U.S. location.');
		}
	}

}

// calculates feels like temperature
function feelsLikeCalc(temp: number, windSpeed: number, humidity: number) {
	let feelsLikeTemp = 0;
	if (temp < 50.0) {
		// cold index feels like formula
		feelsLikeTemp = 35.74 + (0.6215 * temp) - (35.75 * Math.pow(windSpeed, 0.16)) + (0.4275 * (temp * Math.pow(windSpeed, 0.16)));
	} else if (temp >= 50.0 && temp <= 80.0) {
		// between 50 and 80 degrees feels like temperstue is the air temperature
		feelsLikeTemp = temp;
	} else {
		// heat index feels like formula
		feelsLikeTemp = -42.379 + (2.04901523 * temp) + (10.14333127 * humidity) -
		(0.22475541 * temp * humidity) - (0.00638783 * Math.pow(temp, 2)) -
		(0.05481717 * Math.pow(humidity, 2)) + (0.00122874 * (Math.pow(temp, 2) * humidity)) +
		(0.00085282 * (temp * Math.pow(humidity, 2))) - (0.00000199 * (Math.pow(temp, 2) * Math.pow(humidity, 2)));
	}
	return feelsLikeTemp;
}
// displays certain image depending on weather condition, feel free to change
function getWeatherImage(temp: number, chanceOfRain: number): string {
	if (chanceOfRain > 50) {
		// rainy emoji
		return 'https://i.imgur.com/XUlAEhI.jpeg';
	} else if (temp >= 85) {
		// hot emoji
		return 'https://i.imgur.com/fkyhOyx.jpeg';
	} else if (temp <= 40) {
		// cold emoji
		return 'https://i.imgur.com/qL5wtvx.png';
	} else {
		// normal day emoji
		return 'https://i.imgur.com/7yQ76KM.jpeg';
	}
}
