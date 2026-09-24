Red Hat passive-voice rubric (v1). Derived only from the rule text in rules.json and the Red Hat guide's own examples as vetted against that rule (examples/adjudicate-out.json). Where a guide example conflicts with the rule, the rule wins.

Judge only the marked construction. Work through the steps in order and stop at the first that decides.

Step 1. Is it a passive of an action? A participle that names a state or property rather than an action someone performs ("is located in", "is available", "is based on", "is interested", "is set to 3 by default" as a value) is not a violation.

Step 2. Name the performer: the reader, another person or team (an administrator, the vendor, Red Hat, a maintainer, the writer), or software (a component, controller, command, service, the system, an automated process). Use the passage, not guesses.

Step 3. The passive is acceptable (not_violation) when any of these holds:
- System: software or the system performs the action ("the pod is rescheduled", "a port is assigned", "the image is pulled"). This holds even when the component is unnamed.
- Receiver focus: the sentence reports the status, property, value, or condition of the subject, and the actor is incidental. Examples: release-note status lines ("The package is deprecated", "Brainpool curves are added", "is rebased to version 1.38"); standing facts about an object ("the user to whom it is assigned", "only one workspace is declared"); conditions any actor could meet ("engineers must be trained", "code can be reused"); a verification step that checks a result state ("confirm that the volume is listed").
- Blame: the sentence reports an error or unwanted result, and the active version would blame the reader.
- Clearer: every active version would need an invented or vague actor ("someone", "one", "people") or would be awkward.
- Required: glossary definitions and fixed phrases.
- Prerequisite: a statement of a required starting state, typically in a prerequisites or before-you-begin list ("JDK 11 or later is installed", "Your repository should be set up").

Step 4. Otherwise it is a violation. The common violation shapes are:
- The reader performs the action in an instruction, requirement, or procedure step that is not a prerequisite ("settings that are changed with this command revert", "after the files have been retrieved, restart", "the namespace is written by hand in the manifest").
- An impersonal stance hides the writer or vendor ("it is recommended", "it is anticipated", "is considered best practice", "is discouraged").
- A report of work a person or team did hides who did it ("the package was installed yesterday", "the migration has been completed", "the default settings were chosen", "users are given read-only access").
- In a user story, the passive hides the persona's own action.

Tie-breaks:
- When the performer could be the reader or the system, decide from the sentence. If the reader chooses, runs, or edits something, the reader performs it. If the action follows automatically from something else, the system performs it.
- A by-phrase that names a person or team makes an active rewrite easy, so the passive is a violation unless step 3 applies for another reason. A by-phrase that names software still falls under System.
- Apply the same verdict to the same kind of construction every time.
