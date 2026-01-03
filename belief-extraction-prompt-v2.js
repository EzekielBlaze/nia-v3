/**
 * BELIEF EXTRACTION PROMPT - Two-Pass Pipeline
 * 
 * Pass A: Extract subjects/entities/concepts
 * Pass B: Extract beliefs ABOUT each subject
 * 
 * This forces the LLM to acknowledge concepts separately from user beliefs.
 */

const PASS_A_SUBJECT_EXTRACTION = `You are extracting SUBJECTS (topics/entities/concepts), NOT beliefs.

Your job is to identify what topics, concepts, technologies, people, or ideas are discussed in this conversation.

CRITICAL RULES:
1. Output ONLY valid JSON - no preamble, no markdown
2. ALWAYS include "user" and "self" as subjects
3. Include ANY noun phrase, concept, technology, or entity mentioned or implied
4. Do NOT extract beliefs yet - just identify what exists in the conversation

OUTPUT FORMAT (strict JSON):
{
  "subjects": [
    {"id": "user", "type": "agent", "description": "The human (Blaze)"},
    {"id": "self", "type": "agent", "description": "The assistant (Nia)"},
    {"id": "...", "type": "concept|technology|person|movement|abstract", "description": "..."}
  ]
}

TYPES:
- agent: user, self, or other people
- technology: programming languages, tools, frameworks
- concept: abstract ideas (memory_safety, justice, freedom)
- movement: social/political movements (open_source, minimalism)
- abstract: philosophical concepts (truth, beauty, ethics)
- entity: organizations, places, things

EXAMPLES:

Conversation: "Rust is amazing because it prevents memory bugs"
Output:
{
  "subjects": [
    {"id": "user", "type": "agent", "description": "The human"},
    {"id": "self", "type": "agent", "description": "The assistant"},
    {"id": "Rust", "type": "technology", "description": "Programming language"},
    {"id": "memory_safety", "type": "concept", "description": "Protection from memory bugs"},
    {"id": "bugs", "type": "concept", "description": "Software errors"}
  ]
}

Conversation: "I think God is merciful"
Output:
{
  "subjects": [
    {"id": "user", "type": "agent", "description": "The human"},
    {"id": "self", "type": "agent", "description": "The assistant"},
    {"id": "God", "type": "entity", "description": "Deity"},
    {"id": "mercy", "type": "abstract", "description": "Compassion/forgiveness"}
  ]
}

NORMALIZE IDs:
- Use snake_case for multi-word concepts: "memory_safety" not "memory safety"
- Keep proper nouns capitalized: "Rust", "Python", "God"
- Be specific: "compile_time_checking" not just "checking"

Output ONLY the JSON object, nothing else.`;

const PASS_B_BELIEF_EXTRACTION = `You are extracting BELIEFS about the subjects identified.

You have a list of subjects. For EACH subject, extract beliefs that are ABOUT that subject.

CRITICAL RULES:
1. Output ONLY valid JSON - no preamble, no markdown
2. Use "about_id" from the subject list - DO NOT invent new subjects
3. Extract beliefs for AT LEAST 2 non-agent subjects if they exist
4. "holder" is who holds the belief (usually "user" or "self")
5. "about_id" is what the belief is ABOUT (can be any subject)

OUTPUT FORMAT (strict JSON):
{
  "beliefs": [
    {
      "about_id": "subject_id_from_list",
      "holder": "user|self",
      "statement": "clear statement about the subject",
      "polarity": "affirmed|negated|uncertain",
      "confidence": 0.0-1.0,
      "evidence": [{"source": "user_message|assistant_response|thinking", "quote": "..."}],
      "time_scope": "long_term|short_term|event",
      "belief_class": "value|preference|factual|causal|meta|identity|instrumental"
    }
  ]
}

BELIEF CLASSES:
- value: normative beliefs ("X is good/important")
- preference: affective beliefs ("I like/love X")
- factual: descriptive beliefs ("X prevents Y")
- causal: cause-effect ("X causes Y")
- identity: core self-beliefs ("I am/value X deeply")
- instrumental: goal-oriented ("X is worth doing to achieve Y")
- meta: beliefs about beliefs ("I should believe X")

EXAMPLES:

Subjects: ["user", "self", "Rust", "memory_safety", "bugs"]

Conversation: "Rust is amazing because it prevents memory bugs"

Output:
{
  "beliefs": [
    {
      "about_id": "user",
      "holder": "user",
      "statement": "I value memory safety in programming",
      "polarity": "affirmed",
      "confidence": 0.8,
      "evidence": [{"source": "user_message", "quote": "prevents memory bugs"}],
      "time_scope": "long_term",
      "belief_class": "value"
    },
    {
      "about_id": "Rust",
      "holder": "user",
      "statement": "Rust prevents memory bugs",
      "polarity": "affirmed",
      "confidence": 0.9,
      "evidence": [{"source": "user_message", "quote": "Rust...prevents memory bugs"}],
      "time_scope": "long_term",
      "belief_class": "factual"
    },
    {
      "about_id": "memory_safety",
      "holder": "user",
      "statement": "Memory safety is important",
      "polarity": "affirmed",
      "confidence": 0.8,
      "evidence": [{"source": "user_message", "quote": "Rust is amazing because it prevents memory bugs"}],
      "time_scope": "long_term",
      "belief_class": "value"
    }
  ]
}

CRITICAL: You MUST extract beliefs for multiple subjects, not just "user"!

Output ONLY the JSON object, nothing else.`;

function generatePassAPrompt(conversation) {
  const { userMessage, assistantResponse, thinking } = conversation;
  
  return `Extract all subjects (topics/entities/concepts) from this conversation:

USER MESSAGE:
${userMessage}

ASSISTANT RESPONSE:
${assistantResponse}

${thinking ? `THINKING:
${thinking}
` : ''}

Remember: Include user/self ALWAYS, plus ANY concepts/technologies/entities mentioned.

Output ONLY the JSON with the subjects list.`;
}

function generatePassBPrompt(conversation, subjects) {
  const { userMessage, assistantResponse, thinking } = conversation;
  
  const subjectList = subjects.map(s => s.id).join(', ');
  
  return `Extract beliefs about the identified subjects.

AVAILABLE SUBJECTS: ${subjectList}

USER MESSAGE:
${userMessage}

ASSISTANT RESPONSE:
${assistantResponse}

${thinking ? `THINKING:
${thinking}
` : ''}

CRITICAL: Extract beliefs for AT LEAST 2 different subjects (not just "user").
Use "about_id" to specify what each belief is ABOUT.
Use "holder" to specify who holds the belief (usually "user" or "self").

Output ONLY the JSON with the beliefs list.`;
}

module.exports = {
  PASS_A_SUBJECT_EXTRACTION,
  PASS_B_BELIEF_EXTRACTION,
  generatePassAPrompt,
  generatePassBPrompt
};
