import {existsSync, readFileSync} from 'fs';
import * as process from 'process';

import {generateUpdateMiddleware} from 'telegraf-middleware-console-time';
import {I18n} from '@grammyjs/i18n';
import {MenuMiddleware} from 'telegraf-inline-menu';
import {Telegraf} from 'telegraf';
import {TelegrafWikibase, resourceKeysFromYaml} from 'telegraf-wikibase';
import * as LocalSession from 'telegraf-session-local';

import {bot as hearsEntity} from './hears-entity';
import {bot as inlineSearch} from './inline-search';
import {bot as locationSearch} from './location-search';
import {Context, Session} from './bot-generics';
import {menu as languageMenu} from './language-menu';

(process as any).title = 'wikidata-tgbot';

const token = process.env['BOT_TOKEN'];
if (!token) {
	throw new Error('You have to provide the bot-token from @BotFather via environment variable (BOT_TOKEN)');
}

const localSession = new LocalSession<Session>({
	// Database name/path, where sessions will be located (default: 'sessions.json')
	database: 'persist/sessions.json',
	// Format of storage/database (default: JSON.stringify / JSON.parse)
	format: {
		serialize: input => JSON.stringify(input, null, '\t') + '\n',
		deserialize: input => JSON.parse(input) as Session,
	},
	getSessionKey: ctx => String(ctx.from?.id),
});

const i18n = new I18n({
	directory: 'locales',
	defaultLanguage: 'en',
	defaultLanguageOnMissing: true,
	useSession: true,
});

const twb = new TelegrafWikibase({
	contextKey: 'wd',
	logQueriedEntityIds: process.env['NODE_ENV'] !== 'production',
	userAgent: 'EdJoPaTo/wikidata-telegram-bot',
});
const wikidataResourceKeyYaml = readFileSync('wikidata-items.yaml', 'utf8');
twb.addResourceKeys(resourceKeysFromYaml(wikidataResourceKeyYaml));

const bot = new Telegraf<Context>(token);
bot.use(localSession.middleware());
bot.use(i18n.middleware());
bot.use(twb.middleware());

if (process.env['NODE_ENV'] !== 'production') {
	bot.use(generateUpdateMiddleware());
}

bot.use(hearsEntity.middleware());
bot.use(inlineSearch.middleware());
bot.use(locationSearch.middleware());

const languageMenuMiddleware = new MenuMiddleware('/', languageMenu);

bot.command(['lang', 'language', 'settings'], async ctx => languageMenuMiddleware.replyToContext(ctx));
bot.hears('/start language', async ctx => languageMenuMiddleware.replyToContext(ctx));

bot.use(languageMenuMiddleware);

bot.command(['start', 'help', 'search'], async ctx => {
	const text = ctx.i18n.t('help');
	return ctx.reply(text, {
		reply_markup: {inline_keyboard: [[{
			text: 'inline search…',
			switch_inline_query_current_chat: '',
		}], [{
			text: '🦑GitHub',
			url: 'https://github.com/EdJoPaTo/wikidata-telegram-bot',
		}]]},
	});
});

bot.catch((error: any) => {
	if (error.message.startsWith('400: Bad Request: query is too old')) {
		return;
	}

	console.error('telegraf error occured', error);
});

async function startup(): Promise<void> {
	await bot.telegram.setMyCommands([
		{command: 'location', description: 'Show info on how to use the location feature'},
		{command: 'help', description: 'Show help'},
		{command: 'language', description: 'set your language'},
		{command: 'settings', description: 'set your language'},
	]);

	await bot.launch();
	console.log(new Date(), 'Bot started as', bot.botInfo?.username);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
startup();
