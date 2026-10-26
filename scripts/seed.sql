-- Starting data for a new database. Run once, right after the migrations:
--   npm run db:seed:remote   (or db:seed:local)
-- Then add the first admin with their Google email (see the README); they add everyone else.

INSERT INTO platforms (key, name, char_limit, color, sort) VALUES
('x', 'X', 280, '#111827', 0),
('facebook', 'Facebook', 63206, '#1877f2', 1),
('instagram', 'Instagram', 2200, '#e1306c', 2),
('linkedin', 'LinkedIn', 3000, '#0a66c2', 3),
('reddit', 'Reddit', 40000, '#ff4500', 4),
('discord', 'Discord', 2000, '#5865f2', 5),
('threads', 'Threads', 500, '#000000', 6),
('tiktok', 'TikTok', 2200, '#25f4ee', 7),
('youtube', 'YouTube', 5000, '#ff0000', 8);

-- The team's topics, in sidebar order, each with the starter text new posts begin from.
INSERT INTO topics (name, description, template, sort, created_at, updated_at) VALUES
('Feature Promotion', 'Show one Poko feature and the problem it solves',
'[The problem, in one line your audience will nod at]

Most founders [what they do today and why it hurts].

With Poko''s [feature name], you [what it does, in one sentence].

→ [Benefit 1]
→ [Benefit 2]
→ [Benefit 3]

Try it: [link]', 1, unixepoch() * 1000, unixepoch() * 1000),

('User Testimonials', 'Real feedback, quotes or reviews from Poko users',
'"[The quote, word for word]"

— [Name], [role] at [company]

[One line on what they made with Poko and what it did for them]

Make yours: [link]', 2, unixepoch() * 1000, unixepoch() * 1000),

('Offer / Discount', 'Limited-time deal, discount code or pricing offer',
'[Offer headline, e.g. 30% off Poko Pro]

[Who it''s for and what they get]

Use code [CODE] at checkout.
Ends [date].

[link]', 3, unixepoch() * 1000, unixepoch() * 1000),

('Free Trial Promotion', 'Push people to try Poko for free',
'[Hook: what you could make today, for free]

Poko turns [your input] into [a finished video] in [time].

No card needed. Start free: [link]', 4, unixepoch() * 1000, unixepoch() * 1000),

('Prompt vs Result', 'Show the prompt given and the output Poko created',
'Prompt:
"[The exact prompt]"

Result:
[Attach the video Poko made]

[One line on how long it took or what stands out]

Try your own prompt: [link]', 5, unixepoch() * 1000, unixepoch() * 1000),

('Giveaway', 'Contest or free reward to boost reach',
'GIVEAWAY: [what people can win]

To enter:
1. Follow [account]
2. Like and repost this
3. Comment [what to comment]

Winner picked on [date]. [Who can enter]', 6, unixepoch() * 1000, unixepoch() * 1000),

('User Stats', 'Growth numbers & milestones (users, videos made, etc.)',
'[Big number] [what it counts, e.g. videos made with Poko]

[How long it took to get here]

[Thank-you line or what it means to us]

Next: [what''s coming]', 7, unixepoch() * 1000, unixepoch() * 1000),

('Daily Update', 'Build-in-public update: what we shipped or learned today',
'Day [N] of building Poko in public.

Shipped today:
- [Thing 1]
- [Thing 2]

Learned: [one lesson]

Tomorrow: [what''s next]', 8, unixepoch() * 1000, unixepoch() * 1000),

('Engagement Post', 'Question / CTA to drive comments, e.g. "Comment your startup to get a free demo video"',
'[The ask, e.g. Comment your startup and we''ll make you a free demo video]

[What they get and why we''re doing it]

[Limit or deadline, e.g. First 20 comments only]', 9, unixepoch() * 1000, unixepoch() * 1000),

('Founders Video', 'Kushal or Sambhav on camera, talking directly',
'[Caption hook]

[One line on what Kushal or Sambhav talks about]

Script:
Hook (first 3 seconds): [...]
Main point: [...]
Story or example: [...]
Close: [...]', 10, unixepoch() * 1000, unixepoch() * 1000),

('Storytelling', 'Founder journey, lessons, behind-the-scenes story',
'[Opening line that drops straight into the moment]

[What happened]

[What went wrong, or what we didn''t expect]

[What we did about it]

[The lesson, in one line]', 11, unixepoch() * 1000, unixepoch() * 1000),

('Demo / Tutorial', 'Step-by-step walkthrough of using Poko',
'How to [outcome] with Poko in [N] steps:

1. [Step]
2. [Step]
3. [Step]

[Attach the screen recording]

Try it: [link]', 12, unixepoch() * 1000, unixepoch() * 1000),

('Comparison Post', 'Poko vs other tools / alternatives',
'Poko vs [other tool]

[Other tool]: [how it works, where it falls short]
Poko: [how it works]

Where [other tool] wins: [be honest]
Where Poko wins: [...]

[Who should pick which]', 13, unixepoch() * 1000, unixepoch() * 1000),

('Videos for Founders', 'Showcase videos Poko made for other founders/startups',
'We made a video for [founder] at [startup].

[What their startup does, in one line]

[What they asked for and what the video shows]

[Attach the video]

Want one for your startup? [CTA]', 14, unixepoch() * 1000, unixepoch() * 1000),

('Informative / Debate Series', 'Recurring series of educational or debate-style content',
'[Series name] #[N]: [topic or question]

[The take, or both sides of it]

[A supporting point, example or number]

What do you think? [question for readers]', 15, unixepoch() * 1000, unixepoch() * 1000),

('Use Case Story', 'Story sharing a real use case to promote Poko',
'[Who] needed [what].

[The problem before Poko]

They used Poko to [what they made].

Result: [the outcome, with numbers if possible]

[CTA]', 16, unixepoch() * 1000, unixepoch() * 1000);
