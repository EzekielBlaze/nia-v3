/**
 * MEMORY EXTRACTION PROMPTS
 * 
 * Two-pass extraction for episodic memories:
 * Pass A: Extract entities/subjects mentioned by USER
 * Pass B: Extract facts about each entity
 * 
 * CRITICAL: Only extracts from USER message, never from assistant.
 */

const PASS_A_ENTITY_EXTRACTION = `You are extracting ENTITIES mentioned by the user.

Your job is to identify people, places, things, or concepts the USER explicitly mentioned.

CRITICAL RULES:
1. Output ONLY valid JSON - no preamble, no markdown
2. ONLY extract entities the USER mentioned in THEIR message
3. Include "user" as a default entity (the person speaking)
4. Do NOT extract entities from the assistant's response
5. Do NOT infer entities - only explicit mentions
6. Do NOT extract colors, words, or trivial observations as entities

OUTPUT FORMAT (strict JSON):
{
  "entities": [
    {"id": "user", "type": "self", "name": "the user"},
    {"id": "entity_id", "type": "person|place|thing|concept|pet|organization", "name": "display name"}
  ]
}

ENTITY TYPES:
- self: The user themselves
- person: Other people (friends, family, colleagues)
- pet: Animals/pets
- place: Locations
- thing: Objects, tools, technologies
- concept: Abstract ideas, topics
- organization: Companies, groups, institutions

DO NOT EXTRACT AS ENTITIES:
- Colors (green, blue, red, etc.)
- Single words that were merely mentioned
- Adjectives or descriptors
- Pronouns without clear referents

EXAMPLES:

User says: "My friend Sarah loves hiking"
Output:
{
  "entities": [
    {"id": "user", "type": "self", "name": "the user"},
    {"id": "sarah", "type": "person", "name": "Sarah"},
    {"id": "hiking", "type": "concept", "name": "hiking"}
  ]
}

User says: "I work at Google and my dog Max is sick"
Output:
{
  "entities": [
    {"id": "user", "type": "self", "name": "the user"},
    {"id": "google", "type": "organization", "name": "Google"},
    {"id": "max", "type": "pet", "name": "Max"}
  ]
}

User says: "hey how are you"
Output:
{
  "entities": [
    {"id": "user", "type": "self", "name": "the user"}
  ]
}

User says: "I like the color green"
Output:
{
  "entities": [
    {"id": "user", "type": "self", "name": "the user"}
  ]
}
(Note: "green" is NOT an entity - it's just a color preference about the user)

NORMALIZE IDs:
- Use lowercase snake_case: "sarah", "max", "google"
- Keep simple and short

Output ONLY the JSON object, nothing else.`;


const PASS_B_FACT_EXTRACTION = `You are extracting FACTS about the entities identified.

You have a list of entities. For each entity, extract FACTS that the USER EXPLICITLY STATED.

CRITICAL PERSPECTIVE RULES:
1. YOU are Nia (the AI assistant)
2. USER is Blaze (the human you're talking to)
3. When user says "you can X" → that means NIA can X (about you/assistant)
4. When user says "I did X" → that means USER/Blaze did X
5. ALWAYS write facts from Nia's perspective:
   - "Blaze likes pizza" (NOT "the user likes pizza")
   - "I can see Blaze's screen" (NOT "user will see what I'm doing")
   - "Blaze went to the store" (NOT "I went to the store")

CRITICAL EXTRACTION RULES:
1. Output ONLY valid JSON - no preamble, no markdown
2. ONLY extract facts the USER directly stated
3. Use "about" from the entity list - DO NOT invent new entities
4. Every fact MUST have a source_quote from the user's message
5. If you cannot quote the user directly, DO NOT extract the fact
6. NEVER extract from assistant response or inferences

ABSOLUTELY DO NOT EXTRACT:
- "[word] is mentioned" - this is NOT a fact, it's noting a word appeared
- "[topic] came up" - too vague to be useful
- "[color] is mentioned" - colors appearing in conversation are not facts
- "[thing] was discussed" - this is meta-commentary, not a fact
- Questions as facts: "can you remember X?" is NOT a fact about abilities
- Requests as facts: "could you help me?" is NOT a fact
- Observations about the conversation itself
- Unresolved pronouns: "She is at work" - WHO is she? ALWAYS use the name!

CRITICAL PRONOUN RULE:
- NEVER write a fact with just "he", "she", "they" as the subject
- ALWAYS resolve pronouns to the actual name mentioned
- If user says "Gloomie is okay, she is at work" → extract "Gloomie is at work" NOT "She is at work"
- If you cannot determine who a pronoun refers to, DO NOT EXTRACT that fact

ONLY EXTRACT facts that are:
- About a specific entity (person, place, thing)
- Stated as truth by the user
- Important enough to remember long-term
- Clear about WHO did/said/is WHAT

OUTPUT FORMAT (strict JSON):
{
  "facts": [
    {
      "about": "entity_id",
      "statement": "clear factual statement from Nia's perspective",
      "source_quote": "exact words from user message",
      "fact_type": "attribute|preference|relationship|state|event|membership",
      "temporal": "permanent|ongoing|past|temporary",
      "importance": 1-10
    }
  ]
}

FACT TYPES:
- attribute: Properties/characteristics ("Sarah is tall", "Max is 3 years old")
- preference: Likes/dislikes ("Blaze loves hiking", "Blaze prefers Python")
- relationship: How entities relate ("Sarah is Blaze's sister", "Max is Blaze's dog")
- state: Current conditions ("Blaze is learning Rust", "Sarah is busy")
- event: Things that happened ("Blaze went to Paris", "Sarah graduated")
- membership: Belonging to groups ("Blaze works at Google", "Sarah joined the team")

IMPORTANCE GUIDE:
- 1-3: Trivial, forgettable (DON'T EXTRACT THESE)
- 4-6: Moderately interesting
- 7-8: Important to remember
- 9-10: Critical personal info

EXAMPLES:

Entities: ["user", "sarah", "hiking"]
User says: "My friend Sarah loves hiking"

Output:
{
  "facts": [
    {
      "about": "sarah",
      "statement": "Sarah is Blaze's friend",
      "source_quote": "My friend Sarah",
      "fact_type": "relationship",
      "temporal": "ongoing",
      "importance": 6
    },
    {
      "about": "sarah",
      "statement": "Sarah loves hiking",
      "source_quote": "Sarah loves hiking",
      "fact_type": "preference",
      "temporal": "ongoing",
      "importance": 7
    }
  ]
}

Entities: ["user"]
User says: "you'll be able to see what I'm doing on my PC"

Output:
{
  "facts": [
    {
      "about": "user",
      "statement": "I will be able to see what Blaze is doing on his PC",
      "source_quote": "you'll be able to see what I'm doing on my PC",
      "fact_type": "state",
      "temporal": "temporary",
      "importance": 7
    }
  ]
}
(Note: "you" = Nia, "I" = Blaze. Statement written from Nia's perspective.)

Entities: ["user"]
User says: "I like green and blue"

Output:
{
  "facts": [
    {
      "about": "user",
      "statement": "Blaze likes the colors green and blue",
      "source_quote": "I like green and blue",
      "fact_type": "preference",
      "temporal": "ongoing",
      "importance": 5
    }
  ]
}
(Note: This is a preference fact, NOT "green is mentioned")

BAD EXTRACTIONS (DO NOT DO THIS):
- {"statement": "Green is mentioned"} ← WRONG: Not a fact
- {"statement": "Colors were discussed"} ← WRONG: Meta-commentary
- {"statement": "The user mentioned hiking"} ← WRONG: "mentioned" is not a fact
- {"statement": "User will see what I'm doing"} ← WRONG: Perspective reversed
- {"statement": "You are digital"} ← WRONG: Vague, no clear subject
- {"statement": "She is at work"} ← WRONG: WHO is she? Use the actual name!

GOOD PRONOUN RESOLUTION:
User says: "Gloomie is okay, she is at work too"
WRONG: {"statement": "She is at work", "about": "she"} ← Useless, who is "she"?
RIGHT: {"statement": "Gloomie is at work", "about": "gloomie"} ← Clear subject!

CRITICAL: 
- The source_quote MUST appear in the user's message
- If you can't quote it, don't extract it
- When in doubt, leave it out
- If importance would be 1-3, don't extract it
- Write statements from Nia's perspective (I = Nia, Blaze = the user)

Output ONLY the JSON object, nothing else.`;


/**
 * Generate Pass A prompt for entity extraction
 */
function generatePassAPrompt(userMessage) {
  return `Extract entities from this USER message ONLY:

USER MESSAGE:
"${userMessage}"

Remember:
- ONLY entities the user explicitly mentioned
- Always include "user" as self
- Do NOT extract colors as entities
- Do NOT extract words that were just "mentioned"
- Skip if just greetings/questions with no real entities

Output ONLY the JSON object.`;
}


/**
 * Generate Pass B prompt for fact extraction
 */
function generatePassBPrompt(userMessage, entities) {
  const entityList = entities.map(e => e.id).join(', ');
  const entityDetails = entities.map(e => `- ${e.id} (${e.type}): ${e.name}`).join('\n');
  
  return `Extract facts about these entities from the USER's message.

ENTITIES FOUND:
${entityDetails}

USER MESSAGE:
"${userMessage}"

PERSPECTIVE REMINDER:
- You are Nia (the AI)
- The user is Blaze (the human)
- "you" in user's message = Nia
- "I" in user's message = Blaze
- Write facts from YOUR perspective (Nia's)

RULES:
- ONLY extract facts explicitly stated by the user
- Every fact needs a source_quote from the user's message
- Use entity IDs from the list above for "about" field
- If no meaningful facts, return {"facts": []}
- Do NOT extract "[X] is mentioned" or "[X] came up"
- Do NOT extract trivial observations (importance 1-3)

Output ONLY the JSON object.`;
}


/**
 * Trivial message patterns - skip extraction entirely
 */
const TRIVIAL_PATTERNS = [
  /^(hey|hi|hello|yo|sup|hiya|howdy|greetings)\b/i,
  /^(ok|okay|sure|yes|no|yeah|nah|yep|nope|cool|nice|great|thanks|thx|ty)\b/i,
  /^how (are|is|was|were|do|did|have|has)\b/i,
  /^what('s| is| are) (up|going on|happening|new)\b/i,
  /^(good|fine|well|bad|tired|busy)\s*(morning|afternoon|evening|night)?[.!?\s]*$/i,
  /^(lol|lmao|haha|hehe|xd|omg|wtf|bruh|wow)\b/i,
  /^[.!?,\s]+$/,
  /^\?+$/
];


/**
 * Check if message is trivial (no facts possible)
 */
function isTrivialMessage(message) {
  const trimmed = message.trim();
  if (trimmed.length < 10) return true;
  return TRIVIAL_PATTERNS.some(p => p.test(trimmed));
}


module.exports = {
  PASS_A_ENTITY_EXTRACTION,
  PASS_B_FACT_EXTRACTION,
  generatePassAPrompt,
  generatePassBPrompt,
  isTrivialMessage,
  TRIVIAL_PATTERNS
};
