/**
 * Plain, Cordis-agnostic display shapes for the in-terminal answerers: one
 * pending tool-approval decision from `@deepseek-ai/dsh-user-approval`'s
 * `approval/request` waterfall, and one pending question from
 * `@deepseek-ai/dsh-user-questions`' `ctx.userQuestions` seam (the
 * `ask_user_question` tool and `dsh-plan-mode`'s `exit_plan_mode` review).
 * @module @tomowang/dsh-tui/tui/interaction/types
 */

/** One pending tool-approval decision, ready to render. */
export interface ApprovalPromptState {
  readonly toolName: string
  readonly callId: string | undefined
  readonly reason: string | undefined
}

/** One selectable answer offered to the user. */
export interface QuestionOptionRow {
  readonly label: string
  readonly description: string | undefined
}

/** One pending question, ready to render. */
export interface QuestionPromptState {
  readonly header: string | undefined
  readonly question: string
  readonly detail: string | undefined
  readonly options: readonly QuestionOptionRow[]
  readonly multiSelect: boolean
  /** The option label that approves a `plan-review` intent, when the question carries one. */
  readonly approveLabel: string | undefined
  /** e.g. "Question 2 of 3"; `undefined` for a single-question request. */
  readonly progress: string | undefined
}

/** The overlay's answer for one question, handed back to the queue. */
export interface QuestionAnswer {
  readonly selected: readonly string[]
  readonly custom: string | undefined
}
