from flask import Blueprint, request, jsonify
from models import db, Product
from datetime import datetime

products_bp = Blueprint('products', __name__)

@products_bp.route('/products', methods=['GET'])
def get_products():
    """Get all products with optional filtering"""
    try:
        status = request.args.get('status')
        search = request.args.get('search', '').lower()
        
        query = Product.query
        
        if status:
            query = query.filter_by(status=status)
        
        if search:
            query = query.filter(
                db.or_(
                    Product.name.ilike(f'%{search}%'),
                    Product.article_number.ilike(f'%{search}%'),
                    Product.description.ilike(f'%{search}%')
                )
            )
        
        products = query.order_by(Product.created_at.desc()).all()
        return jsonify([product.to_dict() for product in products]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@products_bp.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Get a specific product by ID"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        return jsonify(product.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@products_bp.route('/products', methods=['POST'])
def create_product():
    """Create a new product"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        if not data.get('article_number'):
            return jsonify({'error': 'Article number is required'}), 400
        
        # Check if article number already exists
        existing = Product.query.filter_by(article_number=data['article_number']).first()
        if existing:
            return jsonify({'error': 'Article number already exists'}), 400
        
        product = Product(
            name=data['name'],
            article_number=data['article_number'],
            version=data.get('version', '1.0'),
            status=data.get('status', 'Koncept'),
            description=data.get('description', '')
        )
        
        db.session.add(product)
        db.session.commit()
        
        return jsonify(product.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@products_bp.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    """Update an existing product"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        data = request.get_json()
        
        # Check if article number is being changed and if it already exists
        if 'article_number' in data and data['article_number'] != product.article_number:
            existing = Product.query.filter_by(article_number=data['article_number']).first()
            if existing:
                return jsonify({'error': 'Article number already exists'}), 400
        
        # Update fields
        if 'name' in data:
            product.name = data['name']
        if 'article_number' in data:
            product.article_number = data['article_number']
        if 'version' in data:
            product.version = data['version']
        if 'status' in data:
            product.status = data['status']
        if 'description' in data:
            product.description = data['description']
        
        product.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify(product.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@products_bp.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete a product"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        db.session.delete(product)
        db.session.commit()
        
        return jsonify({'message': 'Product deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
