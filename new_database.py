from models import db, ObjectType, ObjectField, Object, ObjectData, ObjectRelation, Document
from utils.auto_id_generator import generate_auto_id
from datetime import datetime, date
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
        if ObjectType.query.first() is not None:
            logger.info("Database already contains data, skipping seed")
            return
        
        logger.info("Seeding database with initial data...")
        
        try:
            # Create Object Types
            object_types_data = [
                {
                    'name': 'Byggdel',
                    'description': 'Byggnadsdel eller konstruktionselement',
                    'icon': 'fa-building',
                    'is_system': True,
                    'fields': [
                        {'field_name': 'Namn', 'field_type': 'text', 'is_required': True, 'display_order': 1},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 2}
                    ]
                },
                {
                    'name': 'Egenskap',
                    'description': 'Egenskaper och värden för byggdelar',
                    'icon': 'fa-tag',
                    'is_system': True,
                    'fields': [
                        {
                            'field_name': 'Egenskapstyp',
                            'field_type': 'select',
                            'is_required': True,
                            'display_order': 1,
                            'field_options': ['Brand', 'Ljud', 'Köldbrygga', 'U-värde', 'Fuktsäkerhet', 'Hållfasthet']
                        },
                        {'field_name': 'Värde', 'field_type': 'text', 'is_required': True, 'display_order': 2},
                        {'field_name': 'Enhet', 'field_type': 'text', 'is_required': False, 'display_order': 3}
                    ]
                },
                {
                    'name': 'Kravställning',
                    'description': 'Krav och specifikationer',
                    'icon': 'fa-clipboard-check',
                    'is_system': True,
                    'fields': [
                        {
                            'field_name': 'Kravställningstyp',
                            'field_type': 'select',
                            'is_required': True,
                            'display_order': 1,
                            'field_options': ['Infästning', 'Drevmån', 'Fall', 'Minimimått', 'Maximimått', 'Tolerans']
                        },
                        {'field_name': 'Värde', 'field_type': 'text', 'is_required': True, 'display_order': 2},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 3},
                        {'field_name': 'Enhet', 'field_type': 'text', 'is_required': False, 'display_order': 4}
                    ]
                },
                {
                    'name': 'Anslutning',
                    'description': 'Anslutningar mellan byggdelar',
                    'icon': 'fa-link',
                    'is_system': True,
                    'fields': [
                        {'field_name': 'Namn', 'field_type': 'text', 'is_required': True, 'display_order': 1},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 2}
                    ]
                },
                {
                    'name': 'Anvisning',
                    'description': 'Anvisningar och instruktioner',
                    'icon': 'fa-book',
                    'is_system': True,
                    'fields': [
                        {'field_name': 'Namn', 'field_type': 'text', 'is_required': True, 'display_order': 1},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 2}
                    ]
                },
                {
                    'name': 'Produkt',
                    'description': 'Produkter och artiklar',
                    'icon': 'fa-box',
                    'is_system': True,
                    'fields': [
                        {'field_name': 'Namn', 'field_type': 'text', 'is_required': True, 'display_order': 1},
                        {'field_name': 'Artikelnummer', 'field_type': 'text', 'is_required': False, 'display_order': 2},
                        {'field_name': 'Tillverkare', 'field_type': 'text', 'is_required': False, 'display_order': 3},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 4},
                        {'field_name': 'Länk', 'field_type': 'text', 'is_required': False, 'display_order': 5}
                    ]
                },
                {
                    'name': 'Filobjekt',
                    'description': 'Filer och dokument',
                    'icon': 'fa-file-pdf',
                    'is_system': True,
                    'fields': [
                        {'field_name': 'Namn', 'field_type': 'text', 'is_required': True, 'display_order': 1},
                        {'field_name': 'Ritningsnummer', 'field_type': 'text', 'is_required': False, 'display_order': 2},
                        {'field_name': 'Revision', 'field_type': 'text', 'is_required': False, 'display_order': 3},
                        {'field_name': 'Beskrivning', 'field_type': 'textarea', 'is_required': False, 'display_order': 4}
                    ]
                }
            ]
            
            object_types = {}
            for ot_data in object_types_data:
                fields_data = ot_data.pop('fields')
                ot = ObjectType(**ot_data)
                db.session.add(ot)
                db.session.flush()
                
                # Add fields
                for field_data in fields_data:
                    field = ObjectField(object_type_id=ot.id, **field_data)
                    db.session.add(field)
                
                object_types[ot.name] = ot
            
            db.session.flush()
            
            # Create example objects
            objects_data = []
            
            # Byggdelar (3 st)
            byggdel_type = object_types['Byggdel']
            byggdel_fields = {f.field_name: f for f in byggdel_type.fields}
            
            byggdel_1 = Object(
                object_type_id=byggdel_type.id,
                auto_id=generate_auto_id('Byggdel'),
                status='Released',
                version='001',
                main_id='BYG-001',
                id_full='BYG-001.001'
            )
            db.session.add(byggdel_1)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=byggdel_1.id,
                field_id=byggdel_fields['Namn'].id,
                value_text='Yttervägg typ 1'
            ))
            db.session.add(ObjectData(
                object_id=byggdel_1.id,
                field_id=byggdel_fields['Beskrivning'].id,
                value_text='Tvåskikts träregelvägg med 220+45mm isolering'
            ))
            
            byggdel_2 = Object(
                object_type_id=byggdel_type.id,
                auto_id=generate_auto_id('Byggdel'),
                status='Released',
                version='001',
                main_id='BYG-002',
                id_full='BYG-002.001'
            )
            db.session.add(byggdel_2)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=byggdel_2.id,
                field_id=byggdel_fields['Namn'].id,
                value_text='Bjälklag mellanplan'
            ))
            db.session.add(ObjectData(
                object_id=byggdel_2.id,
                field_id=byggdel_fields['Beskrivning'].id,
                value_text='Träbjälklag med 240mm balkar'
            ))
            
            byggdel_3 = Object(
                object_type_id=byggdel_type.id,
                auto_id=generate_auto_id('Byggdel'),
                status='Released',
                version='001',
                main_id='BYG-003',
                id_full='BYG-003.001'
            )
            db.session.add(byggdel_3)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=byggdel_3.id,
                field_id=byggdel_fields['Namn'].id,
                value_text='Platta på mark'
            ))
            db.session.add(ObjectData(
                object_id=byggdel_3.id,
                field_id=byggdel_fields['Beskrivning'].id,
                value_text='Isolerad betongplatta 150mm'
            ))
            
            # Egenskaper (6 st)
            egenskap_type = object_types['Egenskap']
            egenskap_fields = {f.field_name: f for f in egenskap_type.fields}
            
            egenskaper_data = [
                {'Egenskapstyp': 'U-värde', 'Värde': '0.15', 'Enhet': 'W/m²K'},
                {'Egenskapstyp': 'Brand', 'Värde': 'EI 60', 'Enhet': ''},
                {'Egenskapstyp': 'Ljud', 'Värde': '52', 'Enhet': 'dB'},
                {'Egenskapstyp': 'U-värde', 'Värde': '0.12', 'Enhet': 'W/m²K'},
                {'Egenskapstyp': 'Brand', 'Värde': 'REI 90', 'Enhet': ''},
                {'Egenskapstyp': 'Köldbrygga', 'Värde': '0.03', 'Enhet': 'W/mK'}
            ]
            
            egenskap_objects = []
            for idx, eg_data in enumerate(egenskaper_data, start=1):
                main_id = f'EGE-{idx:03d}'
                eg = Object(
                    object_type_id=egenskap_type.id,
                    auto_id=generate_auto_id('Egenskap'),
                    status='Released',
                    version='001',
                    main_id=main_id,
                    id_full=f'{main_id}.001'
                )
                db.session.add(eg)
                db.session.flush()
                
                for field_name, value in eg_data.items():
                    db.session.add(ObjectData(
                        object_id=eg.id,
                        field_id=egenskap_fields[field_name].id,
                        value_text=value
                    ))
                
                egenskap_objects.append(eg)
            
            # Kravställningar (4 st)
            krav_type = object_types['Kravställning']
            krav_fields = {f.field_name: f for f in krav_type.fields}
            
            krav_data = [
                {'Kravställningstyp': 'Minimimått', 'Värde': '240', 'Enhet': 'mm', 'Beskrivning': 'Vägg'},
                {'Kravställningstyp': 'Fall', 'Värde': '1:100', 'Enhet': '', 'Beskrivning': 'Bjälklag'},
                {'Kravställningstyp': 'Drevmån', 'Värde': '15', 'Enhet': 'mm', 'Beskrivning': 'Anslutning'},
                {'Kravställningstyp': 'Infästning', 'Värde': '300', 'Enhet': 'mm c/c', 'Beskrivning': 'Vägg'}
            ]
            
            krav_objects = []
            for idx, kr_data in enumerate(krav_data, start=1):
                main_id = f'KRA-{idx:03d}'
                kr = Object(
                    object_type_id=krav_type.id,
                    auto_id=generate_auto_id('Kravställning'),
                    status='Released',
                    version='001',
                    main_id=main_id,
                    id_full=f'{main_id}.001'
                )
                db.session.add(kr)
                db.session.flush()
                
                for field_name, value in kr_data.items():
                    db.session.add(ObjectData(
                        object_id=kr.id,
                        field_id=krav_fields[field_name].id,
                        value_text=value
                    ))
                
                krav_objects.append(kr)
            
            # Produkter (5 st)
            produkt_type = object_types['Produkt']
            produkt_fields = {f.field_name: f for f in produkt_type.fields}
            
            produkter_data = [
                {'Namn': 'Träreglar 45x220', 'Artikelnummer': 'TR-45220', 'Tillverkare': 'Träfabriken AB', 'Beskrivning': 'C24 impregnerad'},
                {'Namn': 'Mineralull 220mm', 'Artikelnummer': 'MIN-220', 'Tillverkare': 'Isover', 'Beskrivning': 'Lösull för väggkonstruktion'},
                {'Namn': 'Vindskydd Tyvek', 'Artikelnummer': 'TYV-001', 'Tillverkare': 'DuPont', 'Beskrivning': 'Diffusionsöppen membran'},
                {'Namn': 'Gipsskiva 13mm', 'Artikelnummer': 'GS-13', 'Tillverkare': 'Gyproc', 'Beskrivning': 'Standard gipsskiva'},
                {'Namn': 'Betong C30/37', 'Artikelnummer': 'BET-C30', 'Tillverkare': 'Cementa', 'Beskrivning': 'Konstruktionsbetong'}
            ]
            
            produkt_objects = []
            for idx, pr_data in enumerate(produkter_data, start=1):
                main_id = f'PROD-{idx:03d}'
                pr = Object(
                    object_type_id=produkt_type.id,
                    auto_id=generate_auto_id('Produkt'),
                    status='Released',
                    version='001',
                    main_id=main_id,
                    id_full=f'{main_id}.001'
                )
                db.session.add(pr)
                db.session.flush()
                
                for field_name, value in pr_data.items():
                    if field_name in produkt_fields and value:
                        db.session.add(ObjectData(
                            object_id=pr.id,
                            field_id=produkt_fields[field_name].id,
                            value_text=value
                        ))
                
                produkt_objects.append(pr)
            
            # Anslutningar (2 st)
            anslutning_type = object_types['Anslutning']
            anslutning_fields = {f.field_name: f for f in anslutning_type.fields}
            
            anslutning_1 = Object(
                object_type_id=anslutning_type.id,
                auto_id=generate_auto_id('Anslutning'),
                status='Released',
                version='001',
                main_id='ANS-001',
                id_full='ANS-001.001'
            )
            db.session.add(anslutning_1)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=anslutning_1.id,
                field_id=anslutning_fields['Namn'].id,
                value_text='Yttervägg till Grund'
            ))
            db.session.add(ObjectData(
                object_id=anslutning_1.id,
                field_id=anslutning_fields['Beskrivning'].id,
                value_text='Anslutning mellan yttervägg och platta på mark'
            ))
            
            anslutning_2 = Object(
                object_type_id=anslutning_type.id,
                auto_id=generate_auto_id('Anslutning'),
                status='Released',
                version='001',
                main_id='ANS-002',
                id_full='ANS-002.001'
            )
            db.session.add(anslutning_2)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=anslutning_2.id,
                field_id=anslutning_fields['Namn'].id,
                value_text='Bjälklag till Yttervägg'
            ))
            db.session.add(ObjectData(
                object_id=anslutning_2.id,
                field_id=anslutning_fields['Beskrivning'].id,
                value_text='Anslutning mellan bjälklag och yttervägg'
            ))
            
            # Anvisningar (2 st)
            anvisning_type = object_types['Anvisning']
            anvisning_fields = {f.field_name: f for f in anvisning_type.fields}
            
            anvisning_1 = Object(
                object_type_id=anvisning_type.id,
                auto_id=generate_auto_id('Anvisning'),
                status='Released',
                version='001',
                main_id='ANV-001',
                id_full='ANV-001.001'
            )
            db.session.add(anvisning_1)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=anvisning_1.id,
                field_id=anvisning_fields['Namn'].id,
                value_text='Installationsanvisning Yttervägg'
            ))
            db.session.add(ObjectData(
                object_id=anvisning_1.id,
                field_id=anvisning_fields['Beskrivning'].id,
                value_text='Detaljerad instruktion för montering av yttervägg'
            ))
            
            anvisning_2 = Object(
                object_type_id=anvisning_type.id,
                auto_id=generate_auto_id('Anvisning'),
                status='Released',
                version='001',
                main_id='ANV-002',
                id_full='ANV-002.001'
            )
            db.session.add(anvisning_2)
            db.session.flush()
            
            db.session.add(ObjectData(
                object_id=anvisning_2.id,
                field_id=anvisning_fields['Namn'].id,
                value_text='Kvalitetskontroll Grund'
            ))
            db.session.add(ObjectData(
                object_id=anvisning_2.id,
                field_id=anvisning_fields['Beskrivning'].id,
                value_text='Kontrollpunkter för grundläggning'
            ))
            
            db.session.flush()
            
            # Create relations
            relations = [
                # Byggdel 1 (Yttervägg) har egenskaper
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=egenskap_objects[0].id, 
                              relation_type='har_egenskap', description='U-värde för yttervägg'),
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=egenskap_objects[1].id,
                              relation_type='har_egenskap', description='Brandklass för yttervägg'),
                
                # Byggdel 1 har krav
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=krav_objects[0].id,
                              relation_type='har_krav', description='Minimimått för yttervägg'),
                
                # Byggdel 1 har produkter
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=produkt_objects[0].id,
                              relation_type='har_produkt', description='Träreglar i yttervägg'),
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=produkt_objects[1].id,
                              relation_type='har_produkt', description='Isolering i yttervägg'),
                
                # Byggdel 1 har anslutning
                ObjectRelation(source_object_id=byggdel_1.id, target_object_id=anslutning_1.id,
                              relation_type='har_anslutning', description='Anslutning yttervägg-grund'),
                
                # Anslutning kopplingar
                ObjectRelation(source_object_id=anslutning_1.id, target_object_id=byggdel_1.id,
                              relation_type='ansluter_objekt_1', description='Yttervägg i anslutning'),
                ObjectRelation(source_object_id=anslutning_1.id, target_object_id=byggdel_3.id,
                              relation_type='ansluter_objekt_2', description='Grund i anslutning'),
                
                # Anslutning har krav och produkter
                ObjectRelation(source_object_id=anslutning_1.id, target_object_id=krav_objects[2].id,
                              relation_type='har_krav', description='Drevmån i anslutning'),
                ObjectRelation(source_object_id=anslutning_1.id, target_object_id=produkt_objects[3].id,
                              relation_type='har_produkt', description='Gipsskiva i anslutning')
            ]
            
            for rel in relations:
                db.session.add(rel)
            
            db.session.commit()
            logger.info("Database seeded successfully with Byggdelssystem data")
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error seeding database: {str(e)}")
            raise
