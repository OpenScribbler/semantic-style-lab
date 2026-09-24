Microsoft passive-voice rubric (v3). Derived only from the rule text in rules.json and the Microsoft guide's own examples as vetted against that rule (examples/adjudicate-out.json). Where a guide example conflicts with the rule, the rule wins. The rule has no general "the system performs the action" exception: a passive is acceptable only under one of the three uses below.

Judge only the marked construction. Work through the steps in order and stop at the first that decides.

Step 1. Is it a passive of an action? A be + participle that names a state, feeling, property, or relation with no action on the subject ("is interested", "is based on", "is limited to", "is located in", "is available", "is set to 3 by default" as a value) is not a passive, and the rule does not apply: not_violation.

Step 2. Name the performer from the passage: the reader (including the reader's code, commands, or arguments the reader passes), another person or team, a component or container the passage names, or the product acting implicitly with no named component.

Step 3. Blame comes first. In an error message, warning, or notification, or a sentence that reports a failure or unwanted result, the passive is acceptable when the hidden actor is the reader or the reader's input, so the active version would say "you" did it and blame or talk down to the reader ("That site can't be found", "Error: A namespace must be given"). When the sentence names a performer other than the reader, such as a policy, job, filter, or service in a by-phrase, the blame use does not apply and step 4 decides.

Step 4. It is a violation when any of these holds:
- The reader performs or must perform the action in instructions or explanations, including "should be", "must be", or "needs to be" directives and conditions on what the reader passes or configures ("the flag must be set", "if a value is omitted"). Address the reader or use the imperative.
- The sentence names the performer, person or software, and the active rewrite is a plain sentence with that performer as subject. The performer can be named in a by-phrase ("the Pod is evicted by the kubelet" → "the kubelet evicts the Pod"), including a specific component followed by a clause about it ("by the admission webhook, which you install in step 3" → "the admission webhook, which you install in step 3, rejects"), or as the subject of an earlier clause in the same sentence ("The controller reads the spec, and then the object is updated" → "and then updates the object"). Naming someone who triggers the action is different from naming its performer: in "When the user clicks OK, the transaction is committed", the user clicks and does not commit.
- An impersonal stance hides the writer or Microsoft giving advice or a judgment the reader should act on ("it is recommended", "is considered best practice", "is not advised"). Use "we recommend" or write around it. A general opinion that no one in particular holds ("what's considered advanced changes over time") is not a stance of the writer.
- The sentence reports work a person or team did and hides who did it ("the cluster was upgraded last night", "the defaults were chosen to").

Step 5. Otherwise the passive is acceptable (not_violation) when one of the remaining uses applies:
- Awkward: the active rewrite would need an invented actor ("someone", "the system", "one"); or the actor is heavy, meaning several actors, or a class of actors that a restrictive clause defines ("by any job that a nightly schedule starts", "by every node that runs the old kernel"), so moving it to subject position front-loads the sentence; or the passive sits in a chain of verbs that share the subject ("arrives at the proxy, is matched to a route, and continues") or in a reduced modifier ("Pods waiting to be scheduled").
- Receiver emphasis: the sentence is about what happens to the object or its resulting state, and the actor is the product acting implicitly or is unknown. The guide's example: "When the user clicks OK, the transaction is committed." An intransitive alternative ("the transaction commits", "the string appears") does not make this a violation, because the guide's own example has one. A modal passive that states a capability or limitation of the object, true no matter who acts ("can't be removed", "can be reused"), and a status line about a version or release ("the default timeout was raised in version 2.0", "is deprecated in 1.29") are receiver emphasis.

Step 6. If none of the uses applies, it is a violation.

Tie-breaks:
- When the performer could be the reader or the product, decide from the sentence. If the reader chooses, runs, edits, or passes something, the reader performs it. If the action follows automatically from something else ("the lock is released when you run the finish command"), the product performs it and step 5 decides.
- Step 4 comes before step 5: a reader-performed action, a named performer, a stance, or a hidden work report makes the passive a violation even when the sentence is also about the object.
- Apply the same verdict to the same kind of construction every time.
