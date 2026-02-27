"""Migration: ensure relation_type_rules contains all directed object type pairs."""
import logging
from routes.relation_type_rules import ensure_complete_relation_rule_matrix

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        created = ensure_complete_relation_rule_matrix()
        if created > 0:
            db.session.commit()
            logger.info(f"Backfilled relation type rule matrix rows: {created}")
        else:
            logger.info("Relation type rule matrix already complete")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error backfilling relation type rule matrix: {str(e)}")
        raise
