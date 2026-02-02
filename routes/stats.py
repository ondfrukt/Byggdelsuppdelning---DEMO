from flask import Blueprint, jsonify
from models import db, Product, Component, BOM, ProductRelation
from sqlalchemy import func

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        db.session.execute(db.text('SELECT 1'))
        return jsonify({
            'status': 'healthy',
            'message': 'API is running and database is connected'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'message': str(e)
        }), 500

@stats_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get statistics about the PLM system"""
    try:
        # Total counts
        total_products = Product.query.count()
        total_components = Component.query.count()
        total_bom_items = BOM.query.count()
        total_relations = ProductRelation.query.count()
        
        # Products by status
        status_counts = db.session.query(
            Product.status,
            func.count(Product.id)
        ).group_by(Product.status).all()
        
        products_by_status = {status: count for status, count in status_counts}
        
        # Components by type
        type_counts = db.session.query(
            Component.type,
            func.count(Component.id)
        ).group_by(Component.type).all()
        
        components_by_type = {comp_type: count for comp_type, count in type_counts}
        
        # Relations by type
        relation_counts = db.session.query(
            ProductRelation.relation_type,
            func.count(ProductRelation.id)
        ).group_by(ProductRelation.relation_type).all()
        
        relations_by_type = {rel_type: count for rel_type, count in relation_counts}
        
        # Recent products
        recent_products = Product.query.order_by(Product.updated_at.desc()).limit(5).all()
        
        return jsonify({
            'total_products': total_products,
            'total_components': total_components,
            'total_bom_items': total_bom_items,
            'total_relations': total_relations,
            'products_by_status': products_by_status,
            'components_by_type': components_by_type,
            'relations_by_type': relations_by_type,
            'recent_products': [product.to_dict() for product in recent_products]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
