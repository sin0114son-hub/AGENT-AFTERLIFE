export const FEEDBACK_SCOPE =
  "This note is stored only in this browser tab and is not sent to the team. It can be lost when the tab closes. Do not include personal data or secrets.";
export const FEEDBACK_SAVED = "Saved in this browser tab only. It was not sent to the team.";

export const GEMINI_DISCLOSURE =
  "Your text is sent to Google when this mode is enabled. Responses vary and are not policy decisions or defense results. Do not enter secrets or personal data. Live mode is disabled unless an operator configures it.";

export const GEMINI_CONSENT =
  "I understand that the text above, together with a fixed task, will be sent to Google's Gemini API for processing. I have not included secrets or personal data.";

export const GEMINI_SCOPE =
  "The model gets a fixed task and your text as untrusted data. It has no real tools: mock tool names are text only, and nothing is executed, deleted or sent anywhere. The result lists fixed text checks on one reply. It is an observation, not a verdict that an attack or a defense worked.";

export const SIMULATION_DISCLOSURE =
  "The text is treated as untrusted tool output. The decision depends only on the action, the source trust level and the policy you see below, not on the text. This does not detect attacks or prove security. No real tool or model is called.";

export const GEMINI_CHECKING = "Checking whether live mode is enabled on this server…";
export const GEMINI_NOT_ENABLED = "Live mode is not available on this server, so nothing will be sent to Google. The simulated mode still works.";
