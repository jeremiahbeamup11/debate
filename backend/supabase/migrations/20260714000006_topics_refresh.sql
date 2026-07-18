-- M-polish: replace the starter topic pack with an original ~40-topic set.
-- Two buckets: (A) fun/spicy opinion topics (no fact-check expected), and
-- (B) topics where debaters naturally make objectively checkable factual claims
-- a judge can challenge — biased toward B, since that bucket showcases TruthCore.
-- Originals — not copied from any commercial game.

delete from public.topics;

insert into public.topics (topic_text) values
    -- (A) opinion / spicy — good for arguing, no clean factual claim
    ('Pineapple ruins pizza'),
    ('Cereal is a soup'),
    ('A hot dog is not a sandwich'),
    ('Breakfast food tastes better at night'),
    ('Movies are better with the subtitles on'),
    ('The window seat beats the aisle seat'),
    ('Group chats should be capped at five people'),
    ('Board games do more harm than good to friendships'),
    ('Autoplay is the worst feature ever invented'),
    ('Saying "no offense" only makes things worse'),
    ('The book is always better than the movie'),
    ('Texting back just "k" is an act of aggression'),
    ('Food tastes better when someone else makes it'),
    ('A burrito is a sandwich'),
    -- (B) checkable — debaters will cite real facts; showcases TruthCore
    ('Renewable energy is now cheaper than fossil fuels'),
    ('Electric cars are better for the climate than gas cars'),
    ('Nuclear power is safer than its reputation suggests'),
    ('The four-day work week makes companies more productive'),
    ('Social media harms teenagers'' mental health more than it helps'),
    ('Remote workers are more productive than in-office workers'),
    ('Space exploration pays for itself through the technology it creates'),
    ('Vaccines rank among the greatest public health achievements in history'),
    ('Humans use far more than ten percent of their brains'),
    ('Video games improve reaction time and hand-eye coordination'),
    ('A plant-based diet is healthier than a meat-heavy one'),
    ('Dogs are measurably smarter than cats'),
    ('Recycling meaningfully reduces the amount of waste in landfills'),
    ('Organic produce is more nutritious than conventional produce'),
    ('Bottled water is no safer to drink than tap water in most cities'),
    ('Over the long run, index funds beat picking individual stocks'),
    ('Homework improves how much students actually learn'),
    ('Standardized test scores predict how well students do in college'),
    ('Daylight saving time does more harm than good'),
    ('Coffee has real, measurable health benefits'),
    ('Humans are the primary driver of recent global warming'),
    ('Sharks kill fewer people each year than vending machines do'),
    ('The Roman Empire fell mainly for economic reasons'),
    ('A penny dropped from a skyscraper could kill someone below'),
    ('Napoleon was close to average height for a Frenchman of his time'),
    ('Cracking your knuckles does not cause arthritis');
