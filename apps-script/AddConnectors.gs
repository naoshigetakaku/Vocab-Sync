/**
 * AddConnectors.gs — a one-off import.
 *
 * The 78 connectors an academic writer needs at C1, filed under "Academic
 * Connectors".
 *
 * Most of what gets taught as "linking words" at this level is not a
 * conjunction at all, and the difference decides the punctuation. Each
 * definition therefore carries a tag:
 *
 *   [Conj]  joins clauses inside one sentence, so a comma is enough:
 *           "The data were limited, whereas the trend was clear."
 *   [Adv]   links separate sentences and CANNOT be joined to the previous
 *           clause by a comma alone: "The data were limited; however, the
 *           trend was clear." A comma there is a comma splice, which is the
 *           commonest error at this level.
 *   [Prep]  takes a noun or an -ing form, never a clause.
 *   [Corr]  a pair, often forcing inversion.
 *   [Rel]   refers back to the whole preceding clause.
 *
 * Correlative pairs are stored under their bare words — "not only but also",
 * "neither nor" — so that searching for either half finds the entry.
 *
 * Safe to run twice: a word already in the folder is skipped, and nothing
 * already in the sheet is modified. All rows go in with one write.
 */

var CONNECTOR_FOLDER = 'Academic Connectors';

/** [connector, part of speech, definition, example sentence] */
var CONNECTOR_WORDS = [
  ['whereas', 'Expression',
   '対照的に、…である一方。[Conj] Joins two clauses to set one against the other. Directly joins clauses, so a comma is enough.',
   'Classical physics treats energy as continuous, whereas quantum theory treats it as discrete.'],
  ['whilst', 'Expression',
   '…である一方、…ではあるが。[Conj] Concession or contrast. The British form of "while"; interchangeable in writing.',
   'Whilst the model is elegant, it fails to account for anomalous results.'],
  ['albeit', 'Expression',
   '…ではあるが。[Conj] Concedes a qualification. Followed by an adjective, adverb or phrase, not usually a full clause.',
   'The reaction proceeds, albeit slowly, at room temperature.'],
  ['notwithstanding', 'Expression',
   '…にもかかわらず。[Prep] Concession. Unusually, it may also follow its noun.',
   'Notwithstanding these limitations, the study offers valuable insights. These limitations notwithstanding, the conclusion stands.'],
  ['nevertheless', 'Adv',
   'それにもかかわらず。[Adv] Concedes the previous point and then overrides it. Needs a semicolon or full stop before it, never a comma alone.',
   'The sample size was small. Nevertheless, the findings were statistically significant.'],
  ['nonetheless', 'Adv',
   'それでもなお。[Adv] Interchangeable with "nevertheless" and slightly more formal.',
   'The evidence is circumstantial; nonetheless, it is consistent.'],
  ['conversely', 'Adv',
   '逆に。[Adv] Introduces the mirror image of what was just said.',
   'Raising the temperature increases the rate; conversely, cooling slows it down.'],
  ['by contrast', 'Expression',
   'それに対して。[Adv] Sets a second case against the first. "In contrast" is equally correct.',
   'Rome expanded through conquest. By contrast, Athens relied largely on naval trade.'],
  ['although', 'Expression',
   '…ではあるが。[Conj] Concession. Joins clauses directly, so a comma suffices.',
   'Although the theory is widely accepted, it remains unproven.'],
  ['even though', 'Expression',
   '…にもかかわらず。[Conj] A stronger "although", stressing the contrast.',
   'Even though the funding was secured, the project never began.'],
  ['despite the fact that', 'Expression',
   '…という事実にもかかわらず。[Conj] Lets "despite" take a clause. Wordy; prefer "although" unless the fact itself needs stressing.',
   'Despite the fact that funding was cut, the project was completed on time.'],
  ['that said', 'Expression',
   'とはいえ。[Adv] Concedes what you have just argued before qualifying it.',
   'The argument is persuasive. That said, it rests on questionable assumptions.'],
  ['having said that', 'Expression',
   'そうは言っても。[Adv] The same move as "that said", slightly more conversational.',
   'The method is reliable. Having said that, it is slow.'],
  ['be that as it may', 'Expression',
   'それはそれとして。[Adv] Sets an objection aside without answering it. Formal.',
   'The data may be incomplete. Be that as it may, the trend is clear.'],
  ['granted that', 'Expression',
   '確かに…だとしても。[Conj] Concedes a point in advance of your own.',
   'Granted that the evidence is limited, the hypothesis is still worth testing.'],
  ['since', 'Expression',
   '…なので。[Conj] Gives a reason the reader is assumed to accept already.',
   'Since the function is continuous, it must attain a maximum on the interval.'],
  ['given that', 'Expression',
   '…であることを考えると。[Conj] Reasons from a stated premise. Very common in mathematics.',
   'Given that the solvent is polar, ionic compounds dissolve readily.'],
  ['in that', 'Expression',
   '…という点で。[Conj] Specifies the respect in which something is true.',
   'The two approaches differ in that one is empirical and the other theoretical.'],
  ['insofar as', 'Expression',
   '…する限りにおいて。[Conj] Limits a claim to a certain extent.',
   'The policy succeeded only insofar as it reduced short-term costs.'],
  ['inasmuch as', 'Expression',
   '…である限り、…なので。[Conj] Formal; means "because" or "to the extent that".',
   'The results are provisional inasmuch as they rely on a single dataset.'],
  ['owing to the fact that', 'Expression',
   '…という事実のために。[Conj] Lets "owing to" take a clause. Wordy; "because" is usually better.',
   'Progress stalled owing to the fact that key data were unavailable.'],
  ['seeing that', 'Expression',
   '…であるからには。[Conj] Reason, slightly less formal than "since".',
   'Seeing that the trend is consistent, further sampling seems unnecessary.'],
  ['hence', 'Adv',
   'それゆえ。[Adv] Draws a consequence. Needs a semicolon or full stop before it.',
   'The enzyme is denatured at high temperatures; hence, activity declines sharply above 40°C.'],
  ['thus', 'Adv',
   'したがって。[Adv] Draws a logical consequence, especially in proofs.',
   'Both sides are divisible by 3; thus, n must be a multiple of 3.'],
  ['therefore', 'Adv',
   'それゆえに。[Adv] The plainest marker of a conclusion.',
   'The premises are true and the logic is valid; therefore, the conclusion follows.'],
  ['consequently', 'Adv',
   '結果として。[Adv] Marks an outcome rather than a deduction.',
   'Demand fell sharply. Consequently, prices dropped.'],
  ['accordingly', 'Adv',
   'それに応じて。[Adv] An action taken in response to what precedes.',
   'The original method proved unreliable; accordingly, a new protocol was adopted.'],
  ['thereby', 'Adv',
   'それによって。[Adv] Names the effect of the action just described. Usually followed by an -ing form.',
   'The catalyst lowers the activation energy, thereby increasing the rate of reaction.'],
  ['such that', 'Expression',
   '…であるように。[Conj] States the condition an object must satisfy. Very common in mathematics.',
   'Choose δ such that |f(x) − L| < ε whenever |x − a| < δ.'],
  ['so much so that', 'Expression',
   '非常に…なので。[Conj] Intensifies the preceding claim and gives its consequence.',
   'The text was heavily corrupted, so much so that whole passages are illegible.'],
  ['provided that', 'Expression',
   '…という条件で。[Conj] States the condition on which a claim holds.',
   'The series converges, provided that |r| < 1.'],
  ['on condition that', 'Expression',
   '…という条件で。[Conj] A formal condition, often contractual.',
   'Access was granted on condition that participants remained anonymous.'],
  ['in the event that', 'Expression',
   '万一…の場合には。[Conj] A contingency that may not arise. Formal.',
   'In the event that the results are inconclusive, a second trial will be conducted.'],
  ['assuming that', 'Expression',
   '…と仮定すると。[Conj] Marks a premise taken for the sake of argument.',
   'Assuming that the gas behaves ideally, the pressure doubles.'],
  ['unless', 'Expression',
   '…でない限り。[Conj] A negative condition.',
   'The equilibrium will not shift unless conditions change.'],
  ['as long as', 'Expression',
   '…である限り。[Conj] A condition that must hold throughout.',
   'The approximation holds as long as the angle remains small.'],
  ['whether or not', 'Expression',
   '…であろうとなかろうと。[Conj] Both cases lead to the same conclusion.',
   'Whether or not the hypothesis is correct, the method is sound.'],
  ['otherwise', 'Adv',
   'さもなければ。[Adv] States what follows if the condition fails.',
   'The samples must be refrigerated; otherwise, they will degrade.'],
  ['moreover', 'Adv',
   'さらに。[Adv] Adds a point of equal or greater weight.',
   'The method is inexpensive. Moreover, it can be scaled up easily.'],
  ['furthermore', 'Adv',
   'さらに。[Adv] Adds a further point; interchangeable with "moreover".',
   'Furthermore, the results have been replicated in three independent studies.'],
  ['in addition to', 'Expression',
   '…に加えて。[Prep] Adds a second item. Followed by a noun or -ing form.',
   'In addition to its economic impact, the reform had significant social consequences.'],
  ['what is more', 'Expression',
   'その上。[Adv] Adds a point that strengthens the case.',
   'The drug is effective; what is more, it has few side effects.'],
  ['indeed', 'Adv',
   '実際。[Adv] Reinforces and sharpens the point just made.',
   'The effect is not negligible; indeed, it accounts for most of the variance.'],
  ['likewise', 'Adv',
   '同様に。[Adv] Says the same holds of a second case.',
   'Cicero relied on rhetorical balance. Likewise, Livy structured his speeches symmetrically.'],
  ['similarly', 'Adv',
   '同様に。[Adv] Draws a parallel; interchangeable with "likewise".',
   'Similarly, the second dataset shows no significant trend.'],
  ['let alone', 'Expression',
   'ましてや…ない。[Conj] Rules out a stronger claim after a negative one.',
   'The data do not support a correlation, let alone a causal link.'],
  ['not to mention', 'Expression',
   '言うまでもなく。[Prep] Adds an item almost too obvious to state.',
   'The process is slow, not to mention expensive.'],
  ['so that', 'Expression',
   '…するために。[Conj] States the purpose of an action.',
   'The experiment was repeated so that random error could be minimised.'],
  ['in order that', 'Expression',
   '…するために。[Conj] A formal "so that", usually with "may" or "might".',
   'The data were anonymised in order that participants might not be identified.'],
  ['lest', 'Expression',
   '…しないように。[Conj] A purpose of avoidance. Formal; followed by the subjunctive or "should".',
   'The solution was added dropwise lest the reaction become too vigorous.'],
  ['with a view to', 'Expression',
   '…を目的として。[Prep] States an intended outcome. Followed by -ing or a noun.',
   'The survey was conducted with a view to informing future policy.'],
  ['so as to', 'Expression',
   '…するために。[Conj] Purpose, followed by an infinitive.',
   'The variables were rescaled so as to simplify the calculation.'],
  ['that is', 'Expression',
   'すなわち。[Adv] Restates the point more precisely. "i.e." is the written abbreviation.',
   'The reaction is exothermic, that is, it releases heat.'],
  ['namely', 'Adv',
   'すなわち。[Adv] Names exactly what was just referred to in general.',
   'Two factors were decisive, namely cost and accessibility.'],
  ['in other words', 'Expression',
   '言い換えれば。[Adv] Restates the point in plainer terms.',
   'The function is injective; in other words, no two inputs share an output.'],
  ['to put it another way', 'Expression',
   '別の言い方をすれば。[Adv] Restates from a different angle.',
   'To put it another way, the author\'s silence is itself a form of argument.'],
  ['for instance', 'Expression',
   '例えば。[Adv] Introduces one case out of several. "For example" is identical in use.',
   'Some metals, for instance sodium, react violently with water.'],
  ['notably', 'Adv',
   '特に。[Adv] Singles out the most striking case.',
   'Several emperors, notably Nero, were later condemned.'],
  ['in particular', 'Expression',
   'とりわけ。[Adv] Narrows a general claim to one case.',
   'The findings are relevant to coastal regions in particular.'],
  ['such as', 'Expression',
   '…のような。[Prep] Introduces examples. Followed by nouns, never a clause.',
   'Transition metals such as iron form coloured compounds.'],
  ['not only but also', 'Expression',
   '…だけでなく…も。[Corr] A pair adding a second, stronger point. Inversion follows "not only" at the start of a sentence.',
   'Not only does the theory explain the data, but it also predicts new phenomena.'],
  ['whether or', 'Expression',
   '…であれ…であれ。[Corr] A pair offering two alternatives.',
   'Whether the effect is genetic or environmental remains unclear.'],
  ['neither nor', 'Expression',
   '…も…もない。[Corr] A pair denying both alternatives.',
   'Neither the original text nor the translation survives intact.'],
  ['the more the more', 'Expression',
   '…すればするほど…。[Corr] A pair linking two quantities that rise together.',
   'The more the concentration increases, the faster the reaction proceeds.'],
  ['no sooner than', 'Expression',
   '…するやいなや。[Corr] A pair marking immediate succession. Inversion is required.',
   'No sooner had the treaty been signed than hostilities resumed.'],
  ['scarcely when', 'Expression',
   '…するかしないかのうちに。[Corr] A pair marking immediate succession. "Hardly ... when" is identical.',
   'Scarcely had the experiment begun when the equipment failed.'],
  ['once', 'Expression',
   'いったん…すると。[Conj] Marks the point after which something holds.',
   'Once the precipitate has formed, filter the mixture.'],
  ['whereupon', 'Expression',
   'するとすぐに。[Conj] Formal; means "immediately after which".',
   'The senate refused, whereupon Caesar crossed the Rubicon.'],
  ['subsequently', 'Adv',
   'その後。[Adv] Places an event later in a sequence.',
   'The compound was isolated and subsequently analysed by NMR.'],
  ['thereafter', 'Adv',
   'それ以降。[Adv] Everything from that point on.',
   'The population grew rapidly until 1850 and declined thereafter.'],
  ['by the time', 'Expression',
   '…する頃には。[Conj] Marks what was already true at a later moment.',
   'By the time the reforms were implemented, the crisis had passed.'],
  ['whereby', 'Expression',
   'それによって…する。[Rel] Means "by which"; introduces the means.',
   'Osmosis is the process whereby water moves across a semi-permeable membrane.'],
  ['in which case', 'Expression',
   'その場合には。[Rel] Carries a condition forward into its consequence.',
   'The value may be negative, in which case the inequality reverses.'],
  ['to which end', 'Expression',
   'そのために。[Rel] Means "for that purpose"; refers back to an aim.',
   'The aim was to reduce emissions, to which end a carbon tax was introduced.'],
  ['on balance', 'Expression',
   '全体として見れば。[Adv] Weighs both sides and comes down on one.',
   'On balance, the benefits of the policy outweigh its costs.'],
  ['all things considered', 'Expression',
   'すべてを考慮すると。[Adv] Concludes after taking everything into account.',
   'All things considered, the second interpretation is more convincing.'],
  ['in sum', 'Expression',
   '要するに。[Adv] Opens a summary. "To sum up" is identical in use.',
   'In sum, the evidence points to a gradual rather than abrupt decline.'],
  ['ultimately', 'Adv',
   '最終的には。[Adv] Points to what the matter finally rests on.',
   'Ultimately, the debate hinges on how "rationality" is defined.']
];

function connectorFolder_() {
  var folders = listFolders_();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].name.toLowerCase() === CONNECTOR_FOLDER.toLowerCase()) return folders[i];
  }
  var created = createFolder_(CONNECTOR_FOLDER);
  Logger.log('Created folder "%s".', CONNECTOR_FOLDER);
  return created;
}

function addConnectors() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var width = schema.width;
  var folder = connectorFolder_().name;

  // What is already in the folder, so a second run adds nothing twice.
  var seen = {};
  var existing = listWords_();
  for (var e = 0; e < existing.length; e++) {
    if ((existing[e].folder || '').toLowerCase() === folder.toLowerCase()) {
      seen[String(existing[e].word).trim().toLowerCase()] = true;
    }
  }

  var now = new Date().toISOString();
  var rows = [];
  var skipped = 0;

  for (var i = 0; i < CONNECTOR_WORDS.length; i++) {
    var entry = CONNECTOR_WORDS[i];
    var key = entry[0].toLowerCase();
    if (seen[key]) {
      skipped += 1;
      continue;
    }
    seen[key] = true;

    // Through the same validation every saved word goes through.
    var fields = validate_({
      word: entry[0], pos: entry[1], definition: entry[2], note: entry[3],
      color: 'default', folder: folder, status: ''
    });
    rows.push(wordToRow_(buildRecord_(fields, Utilities.getUuid(), now, now), schema.map, width));
  }

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  }

  Logger.log('Added %s connector(s) to "%s".', rows.length, folder);
  if (skipped) Logger.log('Skipped %s already in that folder.', skipped);
  Logger.log('Done. The app picks these up on its next sync.');
}
