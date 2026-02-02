from models import db, Product, Component, BOM, ProductRelation
import logging

logger = logging.getLogger(__name__)

def init_db(app):
    """Initialize the database"""
    with app.app_context():
        db.create_all()
        logger.info("Database tables created successfully")

def seed_data(app):
    """Populate database with seed data if it's empty"""
    with app.app_context():
        # Check if data already exists
        if Product.query.first() is not None:
            logger.info("Database already contains data, skipping seed")
            return
        
        logger.info("Seeding database with initial data...")
        
        try:
            # Create products
            products = [
                Product(
                    name="Cykel Modell X",
                    article_number="CYK-001",
                    version="2.0",
                    status="Godkänd",
                    description="Modern standardcykel för vardagsbruk"
                ),
                Product(
                    name="Elcykel Pro",
                    article_number="ECYK-001",
                    version="1.5",
                    status="Under utveckling",
                    description="Professionell elcykel med 250W motor"
                ),
                Product(
                    name="Cykelram Standard",
                    article_number="RAM-001",
                    version="1.0",
                    status="Godkänd",
                    description="Standardram i stål"
                ),
                Product(
                    name="Cykelram Carbon",
                    article_number="RAM-002",
                    version="1.0",
                    status="Under utveckling",
                    description="Lätt carbonram för prestanda"
                ),
                Product(
                    name="Hjulset 28\"",
                    article_number="HJU-001",
                    version="1.2",
                    status="Godkänd",
                    description="Komplett hjulset för 28-tums cyklar"
                ),
                Product(
                    name="Elmotorkit 250W",
                    article_number="MOT-001",
                    version="3.0",
                    status="Godkänd",
                    description="Komplett motorkit inkl. styrenhet och batteri"
                ),
                Product(
                    name="Cykel Modell X - Gammal",
                    article_number="CYK-001-OLD",
                    version="1.0",
                    status="Obsolete",
                    description="Föregående version av Cykel Modell X"
                )
            ]
            
            for product in products:
                db.session.add(product)
            db.session.flush()
            
            # Create components
            components = [
                Component(name="Stålrör 28mm", type="Mekanik", specifications="Högkvalitets stålrör", unit="st"),
                Component(name="Aluminiumrör 32mm", type="Mekanik", specifications="Lätt aluminiumlegering", unit="st"),
                Component(name="Kolfiberark 2mm", type="Material", specifications="Högmodul kolfiber", unit="m²"),
                Component(name="Hjul 28\" fram", type="Mekanik", specifications="Aluminiumnav med dubbelvägg", unit="st"),
                Component(name="Hjul 28\" bak", type="Mekanik", specifications="Aluminiumnav med dubbelvägg", unit="st"),
                Component(name="Bromssystem hydraulisk", type="Mekanik", specifications="Skivbromsar fram och bak", unit="set"),
                Component(name="Växelsystem 21-växlad", type="Mekanik", specifications="Shimano kompatibel", unit="st"),
                Component(name="Elmotor 250W", type="Elektronik", specifications="Borstlös DC-motor", unit="st"),
                Component(name="Batteri 500Wh", type="Elektronik", specifications="Li-Ion 36V 13.9Ah", unit="st"),
                Component(name="Styrdator", type="Elektronik", specifications="LCD-display med USB", unit="st"),
                Component(name="Sadel komfort", type="Mekanik", specifications="Ergonomisk med gel", unit="st"),
                Component(name="Pedaler aluminium", type="Mekanik", specifications="Anti-slip aluminium", unit="par")
            ]
            
            for component in components:
                db.session.add(component)
            db.session.flush()
            
            # Create BOM entries
            # Cykel Modell X BOM
            cykel_x = Product.query.filter_by(article_number="CYK-001").first()
            ram_standard = Product.query.filter_by(article_number="RAM-001").first()
            hjulset = Product.query.filter_by(article_number="HJU-001").first()
            
            hjul_fram = Component.query.filter_by(name="Hjul 28\" fram").first()
            hjul_bak = Component.query.filter_by(name="Hjul 28\" bak").first()
            bromssystem = Component.query.filter_by(name="Bromssystem hydraulisk").first()
            vaxelsystem = Component.query.filter_by(name="Växelsystem 21-växlad").first()
            sadel = Component.query.filter_by(name="Sadel komfort").first()
            pedaler = Component.query.filter_by(name="Pedaler aluminium").first()
            
            bom_cykel_x = [
                BOM(product_id=cykel_x.id, component_id=hjul_fram.id, quantity=1, position=1, notes="Framhjul"),
                BOM(product_id=cykel_x.id, component_id=hjul_bak.id, quantity=1, position=2, notes="Bakhjul"),
                BOM(product_id=cykel_x.id, component_id=bromssystem.id, quantity=1, position=3, notes="Komplett bromssystem"),
                BOM(product_id=cykel_x.id, component_id=vaxelsystem.id, quantity=1, position=4, notes="21-växlad växel"),
                BOM(product_id=cykel_x.id, component_id=sadel.id, quantity=1, position=5, notes="Komfortsadel"),
                BOM(product_id=cykel_x.id, component_id=pedaler.id, quantity=1, position=6, notes="Aluminiumpedalpar")
            ]
            
            # Elcykel Pro BOM
            elcykel = Product.query.filter_by(article_number="ECYK-001").first()
            ram_carbon = Product.query.filter_by(article_number="RAM-002").first()
            elmotorkit = Product.query.filter_by(article_number="MOT-001").first()
            
            elmotor = Component.query.filter_by(name="Elmotor 250W").first()
            batteri = Component.query.filter_by(name="Batteri 500Wh").first()
            styrdator = Component.query.filter_by(name="Styrdator").first()
            
            bom_elcykel = [
                BOM(product_id=elcykel.id, component_id=hjul_fram.id, quantity=1, position=1, notes="Framhjul"),
                BOM(product_id=elcykel.id, component_id=hjul_bak.id, quantity=1, position=2, notes="Bakhjul med motor"),
                BOM(product_id=elcykel.id, component_id=bromssystem.id, quantity=1, position=3, notes="Hydrauliska bromsar"),
                BOM(product_id=elcykel.id, component_id=vaxelsystem.id, quantity=1, position=4, notes="21-växlad växel"),
                BOM(product_id=elcykel.id, component_id=elmotor.id, quantity=1, position=5, notes="250W elmotor"),
                BOM(product_id=elcykel.id, component_id=batteri.id, quantity=1, position=6, notes="500Wh Li-Ion batteri"),
                BOM(product_id=elcykel.id, component_id=styrdator.id, quantity=1, position=7, notes="Styrenhet med display"),
                BOM(product_id=elcykel.id, component_id=sadel.id, quantity=1, position=8, notes="Komfortsadel"),
                BOM(product_id=elcykel.id, component_id=pedaler.id, quantity=1, position=9, notes="Aluminiumpedalpar")
            ]
            
            # Cykelram Standard BOM
            stalror = Component.query.filter_by(name="Stålrör 28mm").first()
            aluror = Component.query.filter_by(name="Aluminiumrör 32mm").first()
            
            bom_ram_standard = [
                BOM(product_id=ram_standard.id, component_id=stalror.id, quantity=15, position=1, notes="Huvudram och förstärkningar"),
                BOM(product_id=ram_standard.id, component_id=aluror.id, quantity=5, position=2, notes="Framgaffel och styrrörsdelar")
            ]
            
            # Cykelram Carbon BOM
            kolfiber = Component.query.filter_by(name="Kolfiberark 2mm").first()
            
            bom_ram_carbon = [
                BOM(product_id=ram_carbon.id, component_id=kolfiber.id, quantity=2.5, position=1, notes="Ramstruktur i kolfiber"),
                BOM(product_id=ram_carbon.id, component_id=aluror.id, quantity=3, position=2, notes="Förstärkningar och fästen")
            ]
            
            # Hjulset BOM
            bom_hjulset = [
                BOM(product_id=hjulset.id, component_id=hjul_fram.id, quantity=1, position=1, notes="Framhjul"),
                BOM(product_id=hjulset.id, component_id=hjul_bak.id, quantity=1, position=2, notes="Bakhjul")
            ]
            
            # Elmotorkit BOM
            bom_elmotorkit = [
                BOM(product_id=elmotorkit.id, component_id=elmotor.id, quantity=1, position=1, notes="250W elmotor"),
                BOM(product_id=elmotorkit.id, component_id=batteri.id, quantity=1, position=2, notes="Batteri 500Wh"),
                BOM(product_id=elmotorkit.id, component_id=styrdator.id, quantity=1, position=3, notes="Styrdator")
            ]
            
            all_bom = bom_cykel_x + bom_elcykel + bom_ram_standard + bom_ram_carbon + bom_hjulset + bom_elmotorkit
            for bom in all_bom:
                db.session.add(bom)
            db.session.flush()
            
            # Create product relations
            cykel_x_old = Product.query.filter_by(article_number="CYK-001-OLD").first()
            
            relations = [
                ProductRelation(
                    parent_product_id=elcykel.id,
                    child_product_id=cykel_x.id,
                    relation_type="variant_av",
                    description="Elcykel Pro är en elektrisk variant av Cykel Modell X"
                ),
                ProductRelation(
                    parent_product_id=cykel_x.id,
                    child_product_id=cykel_x_old.id,
                    relation_type="ersätter",
                    description="Cykel Modell X v2.0 ersätter den gamla versionen"
                ),
                ProductRelation(
                    parent_product_id=cykel_x.id,
                    child_product_id=ram_standard.id,
                    relation_type="består_av",
                    description="Cykel Modell X använder standardram"
                ),
                ProductRelation(
                    parent_product_id=elcykel.id,
                    child_product_id=ram_carbon.id,
                    relation_type="består_av",
                    description="Elcykel Pro använder carbonram för lägre vikt"
                ),
                ProductRelation(
                    parent_product_id=cykel_x.id,
                    child_product_id=hjulset.id,
                    relation_type="består_av",
                    description="Cykel Modell X använder 28\" hjulset"
                ),
                ProductRelation(
                    parent_product_id=elcykel.id,
                    child_product_id=elmotorkit.id,
                    relation_type="består_av",
                    description="Elcykel Pro använder 250W elmotorkit"
                )
            ]
            
            for relation in relations:
                db.session.add(relation)
            
            db.session.commit()
            logger.info("Database seeded successfully with demo data")
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error seeding database: {str(e)}")
            raise
