-- The review step is gone: "waiting for review" and "changes requested" both become "working".
UPDATE post_targets SET status = 'working' WHERE status IN ('waiting_review', 'changes_requested');
