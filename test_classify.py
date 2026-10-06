"""
Unit tests for classify.py

Run:  python -m pytest test_classify.py -v
  or: python test_classify.py
"""

from __future__ import annotations

import sys
import unittest

from classify import classify, is_relevant, passes_inclusion


def _rec(**kw) -> dict:
    """Helper — build a minimal record dict."""
    return {
        "id":          kw.get("id", "test-1"),
        "title":       kw.get("title", ""),
        "summary":     kw.get("summary", ""),
        "source":      kw.get("source", "test"),
        "source_type": kw.get("source_type", "journal"),
    }


class TestIsRelevant(unittest.TestCase):

    def test_measles_in_title(self):
        r = _rec(title="Measles outbreak in a school")
        self.assertTrue(is_relevant(r))

    def test_mmr_in_title(self):
        r = _rec(title="MMR vaccination coverage in children")
        self.assertTrue(is_relevant(r))

    def test_rubella_in_summary(self):
        r = _rec(summary="Congenital rubella syndrome following maternal infection")
        self.assertTrue(is_relevant(r))

    def test_irrelevant_record(self):
        r = _rec(title="COVID-19 vaccination in pregnancy", summary="mRNA vaccines and adverse events")
        self.assertFalse(is_relevant(r))

    def test_clinical_trial_always_relevant(self):
        r = _rec(title="Influenza vaccine trial", source_type="clinical_trial")
        self.assertTrue(is_relevant(r))


class TestClassifyPolicyArea(unittest.TestCase):

    def test_pregnancy_mmr(self):
        r = _rec(title="Safety of MMR vaccination during pregnancy", summary="inadvertent mmr in pregnancy outcomes")
        classify(r)
        self.assertIn("pregnancy_mmr", r["policy_area"])
        self.assertTrue(r["pregnancy_related"])

    def test_pregnancy_infection(self):
        r = _rec(title="Measles infection in pregnancy — fetal outcomes", summary="congenital measles cases preterm birth")
        classify(r)
        self.assertIn("pregnancy_infection", r["policy_area"])
        self.assertTrue(r["pregnancy_related"])

    def test_schedule_timing(self):
        r = _rec(title="Optimal timing for MMR second dose in children", summary="mmr schedule 12 months 18 months second dose interval")
        classify(r)
        self.assertIn("schedule_timing", r["policy_area"])
        self.assertFalse(r["pregnancy_related"])

    def test_general_measles_fallback(self):
        r = _rec(title="Measles elimination in Europe", summary="outbreak surveillance herd immunity coverage")
        classify(r)
        self.assertIn("general_measles", r["policy_area"])
        self.assertFalse(r["pregnancy_related"])

    def test_dual_tagging(self):
        """A record can be tagged with multiple policy areas."""
        r = _rec(
            title="MMR second dose timing and safety in pregnant women",
            summary="second dose mmr schedule inadvertent vaccination in pregnancy",
        )
        classify(r)
        areas = r["policy_area"]
        self.assertIn("pregnancy_mmr", areas)
        self.assertIn("schedule_timing", areas)
        self.assertTrue(r["pregnancy_related"])


class TestClassifySpecies(unittest.TestCase):

    def test_human(self):
        r = _rec(summary="randomized controlled trial in adults and children vaccinees")
        classify(r)
        self.assertEqual(r["species"], "human")

    def test_animal(self):
        r = _rec(summary="murine model preclinical study in mice measles")
        classify(r)
        self.assertEqual(r["species"], "animal")

    def test_both(self):
        r = _rec(summary="primate and human immunogenicity study participants macaque")
        classify(r)
        self.assertEqual(r["species"], "both")


class TestClassifyCanadian(unittest.TestCase):

    def test_phac(self):
        r = _rec(summary="PHAC measles surveillance report 2025")
        classify(r)
        self.assertTrue(r["canadian"])

    def test_naci(self):
        r = _rec(title="NACI recommendation on MMR schedule")
        classify(r)
        self.assertTrue(r["canadian"])

    def test_non_canadian(self):
        r = _rec(title="CDC ACIP measles vaccine guidance 2024")
        classify(r)
        self.assertFalse(r["canadian"])


class TestClassifySurveillanceUpgrade(unittest.TestCase):

    def test_vaers_upgrades_news(self):
        r = _rec(title="VAERS reports for MMR vaccine 2024", source_type="news")
        classify(r)
        self.assertEqual(r["source_type"], "surveillance")

    def test_mmwr_upgrades(self):
        r = _rec(title="MMWR: Measles cases United States 2025", source_type="journal")
        classify(r)
        self.assertEqual(r["source_type"], "surveillance")

    def test_guideline_not_downgraded(self):
        r = _rec(title="NACI measles guideline — AEFI data reviewed", source_type="guideline")
        classify(r)
        self.assertEqual(r["source_type"], "guideline")


class TestPassesInclusion(unittest.TestCase):

    def test_animal_record_kept(self):
        """Unlike Ebola dashboard, animal studies are kept."""
        r = _rec(title="Measles virus in macaque model — immunogenicity")
        classify(r)
        self.assertEqual(r["species"], "animal")
        self.assertTrue(passes_inclusion(r))

    def test_human_record_kept(self):
        r = _rec(title="MMR second dose response in children — RCT")
        classify(r)
        self.assertTrue(passes_inclusion(r))


if __name__ == "__main__":
    unittest.main(verbosity=2)
