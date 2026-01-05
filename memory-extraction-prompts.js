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

NORMALIZE IDs:
- Use lowercase snake_case: "sarah", "max", "google"
- Keep simple and short

Output ONLY the JSON object, nothing else.`;


const PASS_B_FACT_EXTRACTION = `You are extracting FACTS about the entities identified.

You have a list of entities. For each entity, extract FACTS that the USER EXPLICITLY STATED.

CRITICAL RULES:
1. Output ONLY valid JSON - no preamble, no markdown
2. ONLY extract facts the USER directly stated
3. Use "about" from the entity list - DO NOT invent new entities
4. Every fact MUST have a source_quote from the user's message
5. If you cannot quote the user directly, DO NOT extract the fact
6. NEVER extract from assistant response or inferences
7. NEVER extract questions as facts - "can you remember X?" is NOT a fact
8. NEVER extract requests as facts - "could you help me?" is NOT about the user's abilities

OUTPUT FORMAT (strict JSON):
{
  "facts": [
    {
      "about": "entity_id",
      "statement": "clear factual statement",
      "source_quote": "exact words from user message",
      "fact_type": "attribute|preference|relationship|state|event|membership",
      "temporal": "permanent|ongoing|past|temporary",
      "importance": 1-10
    }
  ]
}

FACT TYPES:
- attribute: Properties/characteristics ("Sarah is tall", "Max is 3 years old")
- preference: Likes/dislikes ("Sarah loves hiking", "I prefer Python")
- relationship: How entities relate ("Sarah is my sister", "Max is my dog")
- state: Current conditions ("I am learning Rust", "Sarah is busy")
- event: Things that happened ("I went to Paris", "Sarah graduated")
- membership: Belonging to groups ("I work at Google", "Sarah joined the team")

IMPORTANCE GUIDE:
- 1-3: Trivial, forgettable
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
      "statement": "Sarah is the user's friend",
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

CRITICAL: 
- The source_quote MUST appear in the user's message
- If you can't quote it, don't extract it
- When in doubt, leave it out

DO NOT EXTRACT (these are NOT facts):
- Questions: "can you help me?" → NOT a fact about user
- Requests: "would you remember this?" → NOT a statement about user's abilities
- Pleasantries: "how are you?" → NOT a fact
- Hypotheticals: "if I were to..." → NOT a fact

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
- Skip if just greetings/questions with no entities

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

RULES:
- ONLY extract facts explicitly stated by the user
- Every fact needs a source_quote from the user's message
- Use entity IDs from the list above for "about" field
- If no facts stated, return {"facts": []}

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
